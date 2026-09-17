import { randomUUID } from "node:crypto";
import { type Tx, Prisma } from "@uei/database";
import { BecknContextFactory, type ProtocolRequest } from "./protocol";
import { DomainError, fingerprint } from "./core";

export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function audit(
  tx: Tx,
  transactionId: string,
  userId: string,
  action: string,
  before: string | null,
  after: string | null,
  detail: unknown = {},
) {
  await tx.auditLog.create({
    data: {
      transactionId,
      userId,
      action,
      before,
      after,
      detail: json(detail),
    },
  });
}
export async function enqueue(
  tx: Tx,
  transactionId: string,
  action: ProtocolRequest["action"],
  providerId: string,
  data: Record<string, unknown>,
) {
  const payload = new BecknContextFactory().create(
    transactionId,
    action,
    providerId,
    data,
  );
  await tx.becknMessage.create({
    data: {
      transactionId,
      messageId: payload.messageId,
      action,
      providerId,
      direction: "OUT",
      payload: json(payload),
    },
  });
  await tx.outboxEvent.create({
    data: {
      transactionId,
      messageId: payload.messageId,
      kind: "REQUEST",
      payload: json(payload),
    },
  });
  return payload.messageId;
}
export async function beginTransaction(tx: Tx, userId: string, kind: string) {
  const id = randomUUID();
  await tx.becknTransaction.create({ data: { id, userId, kind } });
  return id;
}
export async function existingCommand(
  tx: Tx,
  userId: string,
  scope: string,
  key: string,
  input: unknown,
) {
  const existing = await tx.idempotencyKey.findUnique({
    where: { userId_scope_key: { userId, scope, key } },
  });
  if (existing && existing.requestHash !== fingerprint(input))
    throw new DomainError(
      "IDEMPOTENCY_CONFLICT",
      "This request key was used with different details.",
      409,
    );
  return existing?.resultId;
}
export async function rememberCommand(
  tx: Tx,
  userId: string,
  scope: string,
  key: string,
  input: unknown,
  resultId: string,
) {
  await tx.idempotencyKey.create({
    data: { userId, scope, key, requestHash: fingerprint(input), resultId },
  });
}
export async function reconcile(tx: Tx, transactionId: string, reason: string) {
  await tx.reconciliationIssue.upsert({
    where: { transactionId_reason: { transactionId, reason } },
    create: { transactionId, reason },
    update: { resolvedAt: null },
  });
}
