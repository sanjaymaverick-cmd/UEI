import { db, atomic } from "@uei/database";
import { getConfig } from "@uei/config";
import { CallbackService } from "./callbacks";
import { transition } from "./core";
import {
  requestSchema,
  SimulatorAdapter,
  type UeiChargingProtocol,
} from "./protocol";
import { paymentAuthPayloadSchema, PaymentOrchestrator } from "./payments";
import { audit, enqueue, json, reconcile } from "./persistence";
import { pollCharging, rejectCharging } from "./charging";
import { SettlementService } from "./settlement";

export class OutboxWorker {
  private running = false;
  constructor(
    private readonly adapter: UeiChargingProtocol = new SimulatorAdapter(),
    private readonly payments: PaymentOrchestrator = new PaymentOrchestrator(),
    private readonly settlement: SettlementService = new SettlementService(),
  ) {}
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.recoverExpiredLeases();
      const candidates = await db.outboxEvent.findMany({
        where: { state: "PENDING", availableAt: { lte: new Date() } },
        orderBy: { createdAt: "asc" },
        take: 25,
      });
      for (const event of candidates) {
        const claim = await db.outboxEvent.updateMany({
          where: { id: event.id, state: "PENDING" },
          data: {
            state: "PROCESSING",
            leaseUntil: new Date(Date.now() + 30000),
          },
        });
        if (!claim.count) continue;
        try {
          if (event.kind === "CALLBACK") {
            await new CallbackService().receive(event.payload);
            await db.outboxEvent.update({
              where: { id: event.id },
              data: { state: "DONE", leaseUntil: null },
            });
            continue;
          }
          if (event.kind === "PAYMENT_AUTH") {
            await this.processPaymentAuth(event);
            continue;
          }
          if (["PAYMENT_CAPTURE", "PAYMENT_RELEASE", "PAYMENT_REFUND"].includes(event.kind)) {
            await this.settlement.process(event);
            continue;
          }
          const request = requestSchema.parse(event.payload);
          const submission = await this.adapter.submit(request); // Never inside a DB transaction.
          await atomic(async (tx) => {
            await tx.becknMessage.updateMany({
              where: {
                transactionId: event.transactionId,
                messageId: event.messageId,
                direction: "OUT",
              },
              data: { ack: submission.ack },
            });
            const transaction = await tx.becknTransaction.findUniqueOrThrow({
              where: { id: event.transactionId },
            });
            if (submission.ack === "NACK") {
              if (request.action === "update") await rejectCharging(tx, event.transactionId, event.messageId, "Provider rejected charging command.");
              const order = await tx.order.findUnique({
                where: { transactionId: event.transactionId },
              });
              if (
                order &&
                ["SELECT_PENDING", "INIT_PENDING", "CONFIRM_PENDING"].includes(
                  order.state,
                )
              ) {
                await tx.order.update({
                  where: { id: order.id },
                  data: { state: "FAILED" },
                });
                await audit(
                  tx,
                  event.transactionId,
                  transaction.userId,
                  "NACK",
                  order.state,
                  "FAILED",
                );
              } else
                await audit(
                  tx,
                  event.transactionId,
                  transaction.userId,
                  "NACK",
                  null,
                  null,
                );
            }
            for (const callback of submission.callbacks)
              await tx.outboxEvent.create({
                data: {
                  transactionId: event.transactionId,
                  messageId: callback.payload.messageId,
                  kind: "CALLBACK",
                  payload: json(callback.payload),
                  availableAt: new Date(Date.now() + callback.delayMs),
                },
              });
            await tx.outboxEvent.update({
              where: { id: event.id },
              data: { state: "DONE", leaseUntil: null },
            });
            await audit(
              tx,
              event.transactionId,
              transaction.userId,
              "SUBMISSION",
              null,
              submission.ack,
              { messageId: event.messageId },
            );
          });
        } catch {
          // No payloads/secrets in logs. Retain pending domain state and flag transport uncertainty.
          await atomic(async (tx) => {
            await tx.outboxEvent.update({
              where: { id: event.id },
              data: { state: "UNCERTAIN", leaseUntil: null },
            });
            await reconcile(
              tx,
              event.transactionId,
              `UNCERTAIN:${event.messageId}`,
            );
          });
        }
      }
      await this.reconcileTimeouts();
      await atomic(pollCharging);
    } finally {
      this.running = false;
    }
  }
  private async recoverExpiredLeases() {
    await atomic(async (tx) => {
      const expired = await tx.outboxEvent.findMany({
        where: { state: "PROCESSING", leaseUntil: { lte: new Date() } },
      });
      for (const event of expired) {
        // Callback replay is safe because Inbox deduplicates it. External requests are never blindly replayed.
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: {
            state: event.kind === "CALLBACK" ? "PENDING" : "UNCERTAIN",
            leaseUntil: null,
          },
        });
        if (event.kind === "REQUEST" || event.kind.startsWith("PAYMENT_"))
          await reconcile(
            tx,
            event.transactionId,
            `UNCERTAIN:${event.messageId}`,
          );
      }
    });
  }
  private async processPaymentAuth(event: {
    id: string;
    messageId: string;
    payload: unknown;
  }) {
    const input = paymentAuthPayloadSchema.parse(event.payload);
    const result = await this.payments.authorize(input); // Never inside a DB transaction.
    await atomic(async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: input.paymentId },
      });
      if (payment.state !== "AUTH_PENDING") {
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: { state: "DONE", leaseUntil: null },
        });
        return;
      }
      await tx.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          state: result.status,
          amountPaise: payment.amountPaise,
          providerReference: result.providerReference,
          failureReason: result.failureReason,
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentId: payment.id,
          kind: result.status === "AUTHORIZED" ? "AUTHORIZED" : "AUTH_FAILED",
          detail: json(result),
        },
      });
      const order = await tx.order.findUniqueOrThrow({
        where: { id: input.orderId },
      });
      if (result.status === "AUTHORIZED") {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            state: "AUTHORIZED",
            providerReference: result.providerReference,
          },
        });
        const state = transition(order.state, "authorized");
        await tx.order.update({ where: { id: order.id }, data: { state } });
        await enqueue(tx, order.transactionId, "confirm", order.providerId, {
          orderId: order.id,
          paymentId: payment.id,
        });
        await audit(
          tx,
          order.transactionId,
          order.userId,
          "PAYMENT_AUTHORIZED",
          "PAYMENT_PENDING",
          state,
          { paymentId: payment.id },
        );
      } else {
        await tx.payment.update({
          where: { id: payment.id },
          data: { state: "FAILED" },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { state: "FAILED" },
        });
        await audit(
          tx,
          order.transactionId,
          order.userId,
          "PAYMENT_FAILED",
          order.state,
          "FAILED",
          { paymentId: payment.id, reason: result.failureReason },
        );
      }
      await tx.reconciliationIssue.updateMany({
        where: {
          transactionId: order.transactionId,
          reason: {
            in: [
              `PAYMENT_TIMEOUT:${payment.id}`,
              `UNCERTAIN:${event.messageId}`,
            ],
          },
        },
        data: { resolvedAt: new Date() },
      });
      await tx.outboxEvent.update({
        where: { id: event.id },
        data: { state: "DONE", leaseUntil: null },
      });
    });
  }
  private async reconcileTimeouts() {
    const cutoff = new Date(Date.now() - getConfig().CALLBACK_TIMEOUT_MS);
    await atomic(async (tx) => {
      const pending = await tx.order.findMany({
        where: {
          state: { in: ["SELECT_PENDING", "INIT_PENDING", "CONFIRM_PENDING", "START_PENDING", "STOP_PENDING"] },
          updatedAt: { lt: cutoff },
        },
        take: 100,
      });
      const actionByState: Record<string, string> = {
        SELECT_PENDING: "select",
        INIT_PENDING: "init",
        CONFIRM_PENDING: "confirm",
        START_PENDING: "update",
        STOP_PENDING: "update",
      };
      for (const order of pending) {
        const action = actionByState[order.state]!;
        const request = await tx.becknMessage.findFirst({
          where: {
            transactionId: order.transactionId,
            action,
            direction: "OUT",
          },
          orderBy: { createdAt: "desc" },
        });
        if (request)
          await reconcile(
            tx,
            order.transactionId,
            `TIMEOUT:${request.messageId}`,
          );
      }
      const stalePayments = await tx.payment.findMany({
        where: { state: "AUTH_PENDING", updatedAt: { lt: cutoff } },
        take: 100,
      });
      for (const payment of stalePayments)
        await reconcile(
          tx,
          payment.transactionId,
          `PAYMENT_TIMEOUT:${payment.id}`,
        );
      const staleSessions = await tx.chargingSession.findMany({
        where: { state: { in: ["CHARGING", "STOP_PENDING", "STOP_FAILED"] }, measuredAt: { lt: cutoff } },
        include: { fulfillment: { include: { order: true } } }, take: 100,
      });
      for (const session of staleSessions)
        await reconcile(tx, session.fulfillment.order.transactionId, `SESSION_STATUS:${session.id}`);
      const searches = await tx.discoveryRequest.findMany({
        where: { closesAt: { lt: new Date() }, results: { none: {} } },
        take: 100,
      });
      for (const search of searches) {
        const received = await tx.becknMessage.count({
          where: {
            transactionId: search.transactionId,
            direction: "IN",
            action: "on_search",
          },
        });
        if (!received)
          await reconcile(tx, search.transactionId, "DISCOVERY_TIMEOUT");
      }
    });
  }
}
