import { randomUUID } from "node:crypto";
import { atomic, db, type Tx } from "@uei/database";
import { z } from "zod";
import { DomainError, idSchema, paiseSchema } from "./core";
import { audit, existingCommand, json, reconcile, rememberCommand } from "./persistence";

export function calculateBill(energyWh: number, ratePaiseKwh: number, taxBps: number) {
  for (const value of [energyWh, ratePaiseKwh, taxBps])
    if (!Number.isSafeInteger(value) || value < 0) throw new DomainError("INVALID_BILL", "Invalid billing quantity.");
  if (taxBps > 10000) throw new DomainError("INVALID_BILL", "Invalid tax rate.");
  // Integer rounding, once at each monetary boundary, without floating-point currency arithmetic.
  const subtotalPaise = Number((BigInt(energyWh) * BigInt(ratePaiseKwh) + 500n) / 1000n);
  const taxPaise = Number((BigInt(subtotalPaise) * BigInt(taxBps) + 5000n) / 10000n);
  const totalPaise = paiseSchema.parse(subtotalPaise + taxPaise);
  return { subtotalPaise, taxPaise, totalPaise };
}

async function enqueueMoney(tx: Tx, transactionId: string, kind: string, paymentId: string, amountPaise: number, refundId?: string) {
  await tx.outboxEvent.create({ data: { transactionId, messageId: randomUUID(), kind, payload: json({ paymentId, amountPaise, refundId }) } });
}

export async function prepareSettlement(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { payment: true, invoice: true, fulfillment: { include: { session: true } } } });
  if (order.invoice) return;
  const session = order.fulfillment?.session;
  const payment = order.payment;
  if (!session?.endedAt || !session.startedAt || session.state !== "COMPLETED" || payment?.state !== "AUTHORIZED") {
    await reconcile(tx, order.transactionId, "SETTLEMENT_NOT_READY");
    return;
  }
  const policies = await tx.taxPolicy.findMany({ where: {
    mode: "SIMULATOR", effectiveFrom: { lte: session.endedAt },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: session.endedAt } }],
  } });
  if (policies.length !== 1) {
    await reconcile(tx, order.transactionId, "TAX_POLICY_REQUIRED");
    return;
  }
  const result = await tx.discoveryResult.findUniqueOrThrow({ where: { id: order.discoveryResultId } });
  const bill = calculateBill(session.energyWh, result.pricePaise, policies[0]!.rateBps);
  if (bill.totalPaise > payment.amountPaise) {
    await reconcile(tx, order.transactionId, "AMOUNT_EXCEEDS_AUTHORIZATION");
    return;
  }
  await tx.invoice.create({ data: { orderId, taxPolicyId: policies[0]!.id, energyWh: session.energyWh, ratePaiseKwh: result.pricePaise, ...bill } });
  await tx.payment.update({ where: { id: payment.id }, data: { state: "CAPTURE_PENDING" } });
  await enqueueMoney(tx, order.transactionId, "PAYMENT_CAPTURE", payment.id, bill.totalPaise);
  await audit(tx, order.transactionId, order.userId, "SETTLEMENT_REQUESTED", "AUTHORIZED", "CAPTURE_PENDING", bill);
}

const moneySchema = z.object({ paymentId: idSchema, amountPaise: paiseSchema, refundId: idSchema.optional() }).strict();
export type MoneyOperation = "capture" | "release" | "refund";
export interface SettlementAdapter {
  execute(operation: MoneyOperation, input: { paymentId: string; amountPaise: number; idempotencyKey: string; providerReference: string }): Promise<{ status: "SUCCEEDED" | "FAILED"; reference?: string }>;
}
export class SimulatorSettlementAdapter implements SettlementAdapter {
  async execute(operation: MoneyOperation, input: { idempotencyKey: string }) {
    return { status: "SUCCEEDED" as const, reference: `sim-${operation}-${input.idempotencyKey}` };
  }
}
export class SettlementService {
  constructor(private readonly adapter: SettlementAdapter = new SimulatorSettlementAdapter()) {}
  async process(event: { id: string; transactionId: string; messageId: string; kind: string; payload: unknown }) {
    const input = moneySchema.parse(event.payload);
    const payment = await db.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
    const operation: MoneyOperation = event.kind === "PAYMENT_CAPTURE" ? "capture" : event.kind === "PAYMENT_RELEASE" ? "release" : "refund";
    const expected = operation === "capture" ? "CAPTURE_PENDING" : "RELEASE_PENDING";
    const refund = input.refundId ? await db.refund.findUnique({ where: { id: input.refundId } }) : null;
    if (operation === "refund" ? !refund || refund.paymentId !== payment.id || refund.state !== "REFUND_PENDING" : payment.state !== expected)
      throw new DomainError("INVALID_TRANSITION", "Financial operation no longer matches persisted state.", 409);
    const result = await this.adapter.execute(operation, { ...input, idempotencyKey: event.messageId, providerReference: payment.providerReference! });
    await atomic(async (tx) => {
      const current = await tx.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
      if (current.state === "DONE") return;
      if (operation === "refund") {
        await tx.refund.update({ where: { id: refund!.id }, data: { state: result.status === "SUCCEEDED" ? "REFUNDED" : "REFUND_FAILED", resolvedAt: new Date() } });
      } else if (result.status === "SUCCEEDED") {
        if (operation === "capture") {
          await tx.payment.update({ where: { id: payment.id }, data: { state: "RELEASE_PENDING", capturedPaise: input.amountPaise } });
          await enqueueMoney(tx, payment.transactionId, "PAYMENT_RELEASE", payment.id, payment.amountPaise - input.amountPaise);
        } else {
          await tx.payment.update({ where: { id: payment.id }, data: { state: "SETTLED", releasedPaise: input.amountPaise } });
          await tx.invoice.update({ where: { orderId: payment.orderId }, data: { state: "ISSUED" } });
        }
      } else {
        await tx.payment.update({ where: { id: payment.id }, data: { state: operation === "capture" ? "CAPTURE_FAILED" : "RELEASE_FAILED" } });
      }
      if (result.status === "FAILED") await reconcile(tx, payment.transactionId, `${operation.toUpperCase()}_FAILED:${event.messageId}`);
      await tx.paymentEvent.create({ data: { paymentId: payment.id, kind: `${operation.toUpperCase()}_${result.status}`, detail: json({ ...input, ...result }) } });
      await audit(tx, payment.transactionId, payment.userId, `PAYMENT_${operation.toUpperCase()}`, null, result.status, { amountPaise: input.amountPaise });
      await tx.outboxEvent.update({ where: { id: event.id }, data: { state: "DONE", leaseUntil: null } });
    });
  }
  async refund(adminId: string, paymentId: string, amountPaise: number, reason: string, key: string) {
    const id = await atomic(async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: adminId } });
      if (actor?.role !== "ADMIN") throw new DomainError("FORBIDDEN", "Admin access is required.", 403);
      const input = { paymentId, amountPaise, reason };
      const previous = await existingCommand(tx, adminId, "refund", key, input);
      if (previous) return previous;
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { refunds: true } });
      if (!payment) throw new DomainError("NOT_FOUND", "Payment not found.", 404);
      const reserved = payment.refunds.filter(r => r.state !== "REFUND_FAILED").reduce((sum, r) => sum + r.amountPaise, 0);
      if (payment.state !== "SETTLED" || !Number.isInteger(amountPaise) || amountPaise <= 0 || amountPaise > payment.capturedPaise - reserved)
        throw new DomainError("INVALID_REFUND", "Refund exceeds the available captured amount.", 409);
      const refund = await tx.refund.create({ data: { paymentId, amountPaise, reason } });
      await enqueueMoney(tx, payment.transactionId, "PAYMENT_REFUND", paymentId, amountPaise, refund.id);
      await audit(tx, payment.transactionId, adminId, "REFUND_REQUESTED", null, "REFUND_PENDING", { refundId: refund.id, amountPaise, reason });
      await rememberCommand(tx, adminId, "refund", key, input, refund.id);
      return refund.id;
    });
    return db.refund.findUniqueOrThrow({ where: { id } });
  }
}
