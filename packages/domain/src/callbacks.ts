import { atomic, type Tx } from "@uei/database";
import {
  callbackSchema,
  DomainError,
  fingerprint,
  resolvePaymentTerms,
  transition,
  type Callback,
} from "./core";
import { audit, json, reconcile } from "./persistence";

export class CallbackService {
  receive(raw: unknown) {
    const payload = callbackSchema.parse(raw);
    return atomic((tx) => this.apply(tx, payload));
  }
  private async apply(tx: Tx, payload: Callback) {
    const { transactionId, providerId, messageId, action } = payload;
    const transaction = await tx.becknTransaction.findUnique({
      where: { id: transactionId },
    });
    if (!transaction)
      throw new DomainError("UNKNOWN_TRANSACTION", "Unknown transaction.", 404);
    if (
      !(await tx.networkParticipant.findUnique({ where: { id: providerId } }))
    )
      throw new DomainError("UNKNOWN_PROVIDER", "Unknown provider.", 403);
    const request = await tx.becknMessage.findFirst({
      where: {
        transactionId,
        messageId: payload.requestMessageId,
        direction: "OUT",
      },
    });
    if (
      !request ||
      (request.providerId !== "*" && request.providerId !== providerId)
    )
      throw new DomainError(
        "CALLBACK_CORRELATION_FAILED",
        "Callback does not match the request.",
        409,
      );
    const key = `${transactionId}:${providerId}:${action}:${messageId}`;
    const payloadHash = fingerprint(payload);
    const existing = await tx.inboxEvent.findUnique({ where: { key } });
    if (existing) {
      if (existing.payloadHash !== payloadHash)
        throw new DomainError(
          "CALLBACK_CONFLICT",
          "Duplicate callback has changed content.",
          409,
        );
      return { ack: "ACK", duplicate: true };
    }
    const inbox = await tx.inboxEvent.create({
      data: { key, payloadHash, transactionId, status: "RECEIVED" },
    });
    await tx.becknMessage.create({
      data: {
        transactionId,
        messageId,
        providerId,
        action,
        direction: "IN",
        payload: json(payload),
        ack: "ACK",
        error: payload.error,
      },
    });
    let status = "APPLIED";
    if (action !== `on_${request.action}`) {
      status = "OUT_OF_ORDER";
      await reconcile(tx, transactionId, `OUT_OF_ORDER:${messageId}`);
    } else if (action === "on_search") {
      const search = await tx.discoveryRequest.findUnique({
        where: { transactionId },
      });
      if (!search)
        throw new DomainError(
          "CALLBACK_CORRELATION_FAILED",
          "Search not found.",
          409,
        );
      if (payload.error) {
        status = "PROVIDER_ERROR";
        await reconcile(tx, transactionId, `PROVIDER_ERROR:${providerId}`);
      } else if (search.closesAt.getTime() <= Date.now()) status = "LATE";
      else {
        const vehicle = await tx.userVehicle.findUniqueOrThrow({
          where: { id: search.vehicleId },
          include: { variant: { include: { connectors: true } } },
        });
        const compatible = new Set(
          vehicle.variant.connectors.map((c) => c.connector),
        );
        for (const item of payload.items ?? []) {
          if (!compatible.has(item.connector)) continue;
          await tx.discoveryResult.upsert({
            where: {
              searchId_providerId_itemId: {
                searchId: search.id,
                providerId,
                itemId: item.itemId,
              },
            },
            create: {
              searchId: search.id,
              providerId,
              ...item,
              raw: json(item),
            },
            update: {},
          });
        }
      }
      await audit(tx, transactionId, transaction.userId, action, null, status, {
        providerId,
        messageId,
      });
    } else {
      const order = await tx.order.findUnique({ where: { transactionId } });
      if (!order || order.providerId !== providerId)
        throw new DomainError(
          "CALLBACK_CORRELATION_FAILED",
          "Order/provider mismatch.",
          409,
        );
      const expected = {
        on_select: "SELECT_PENDING",
        on_init: "INIT_PENDING",
        on_confirm: "CONFIRM_PENDING",
      }[action]!;
      if (order.state !== expected) {
        status = "OUT_OF_ORDER";
        await reconcile(tx, transactionId, `OUT_OF_ORDER:${messageId}`);
      } else if (payload.error) {
        await tx.order.update({
          where: { id: order.id },
          data: { state: "FAILED" },
        });
        await audit(
          tx,
          transactionId,
          order.userId,
          action,
          order.state,
          "FAILED",
          { providerId, messageId, error: payload.error },
        );
      } else {
        const state = transition(order.state, action);
        if (action === "on_select") {
          const quote = payload.quote!;
          if (new Date(quote.expiresAt).getTime() <= Date.now()) {
            status = "EXPIRED_QUOTE";
            await reconcile(tx, transactionId, `EXPIRED_QUOTE:${messageId}`);
          } else
            await tx.quoteSnapshot.create({
              data: {
                orderId: order.id,
                amountPaise: quote.amountPaise,
                currency: quote.currency,
                expiresAt: new Date(quote.expiresAt),
                raw: json(quote),
              },
            });
        }
        if (status === "APPLIED") {
          await tx.order.update({
            where: { id: order.id },
            data: {
              state,
              ...(action === "on_init"
                ? {
                    paymentTerms: json(
                      resolvePaymentTerms(payload.paymentTerms),
                    ),
                    rawPaymentTerms: json(payload.paymentTerms),
                  }
                : {}),
            },
          });
          await audit(
            tx,
            transactionId,
            order.userId,
            action,
            order.state,
            state,
            { providerId, messageId },
          );
        }
      }
    }
    if (status === "APPLIED" || status === "PROVIDER_ERROR") {
      await tx.reconciliationIssue.updateMany({
        where: {
          transactionId,
          reason: {
            in: [
              `TIMEOUT:${payload.requestMessageId}`,
              `UNCERTAIN:${payload.requestMessageId}`,
            ],
          },
        },
        data: { resolvedAt: new Date() },
      });
    }
    if (status !== "APPLIED")
      await audit(
        tx,
        transactionId,
        transaction.userId,
        "CALLBACK_RECORDED",
        null,
        status,
        { providerId, messageId },
      );
    await tx.inboxEvent.update({ where: { id: inbox.id }, data: { status } });
    return { ack: "ACK", duplicate: false, status };
  }
}
