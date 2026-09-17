import { atomic, type Tx } from "@uei/database";
import { DomainError, type Callback } from "./core";
import { audit, enqueue, existingCommand, json, reconcile, rememberCommand } from "./persistence";
import { OrderService } from "./orders";
import { prepareSettlement } from "./settlement";
import { requestSchema } from "./protocol";

export class ChargingService {
  async command(userId: string, orderId: string, command: "start-charging" | "end-charging", key: string) {
    await atomic(async (tx) => {
      if (await existingCommand(tx, userId, command, key, { orderId })) return;
      const order = await tx.order.findFirst({
        where: { id: orderId, userId },
        include: { payment: true, fulfillment: { include: { session: true } } },
      });
      if (!order) throw new DomainError("NOT_FOUND", "Order not found.", 404);
      const start = command === "start-charging";
      if (start ? order.state !== "CONFIRMED" || order.payment?.state !== "AUTHORIZED"
        : order.state !== "CHARGING" || !order.fulfillment?.session?.startedAt)
        throw new DomainError("INVALID_TRANSITION", "This charging command is not available in the current state.", 409);
      const state = start ? "START_PENDING" : "STOP_PENDING";
      const fulfillment = await tx.fulfillment.upsert({
        where: { orderId }, create: { orderId, state }, update: { state },
      });
      const session = await tx.chargingSession.upsert({
        where: { fulfillmentId: fulfillment.id },
        create: { fulfillmentId: fulfillment.id, state }, update: { state, nextPollAt: null },
      });
      const messageId = await enqueue(tx, order.transactionId, "update", order.providerId, {
        orderId, sessionId: session.id, command, startedAt: session.startedAt?.toISOString(), energyWh: session.energyWh,
      });
      await tx.chargingSession.update({ where: { id: session.id }, data: { pendingRequestId: messageId } });
      await tx.order.update({ where: { id: orderId }, data: { state } });
      await tx.sessionEvent.create({ data: { sessionId: session.id, kind: state, detail: json({ messageId }) } });
      await audit(tx, order.transactionId, userId, command, order.state, state, { sessionId: session.id });
      await rememberCommand(tx, userId, command, key, { orderId }, orderId);
    });
    return new OrderService().get(userId, orderId);
  }
}

// An explicit rejection is different from transport uncertainty. A rejected stop leaves the charger running.
export async function rejectCharging(tx: Tx, transactionId: string, requestMessageId: string, reason: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { transactionId }, include: { fulfillment: { include: { session: true } } } });
  const session = order.fulfillment?.session;
  if (!session || session.pendingRequestId !== requestMessageId || !["START_PENDING", "STOP_PENDING"].includes(session.state)) return;
  const start = session.state === "START_PENDING";
  const state = start ? "START_FAILED" : "STOP_FAILED";
  await tx.chargingSession.update({ where: { id: session.id }, data: { state, pendingRequestId: null, nextPollAt: start ? null : new Date() } });
  await tx.fulfillment.update({ where: { id: session.fulfillmentId }, data: { state } });
  await tx.order.update({ where: { id: order.id }, data: { state: start ? "CONFIRMED" : "CHARGING" } });
  await tx.sessionEvent.create({ data: { sessionId: session.id, kind: state, detail: json({ reason }) } });
  await audit(tx, transactionId, order.userId, state, order.state, start ? "CONFIRMED" : "CHARGING", { sessionId: session.id, reason });
}

export async function applyChargingCallback(tx: Tx, payload: Callback, rawRequest: unknown): Promise<string> {
  const request = requestSchema.parse(rawRequest);
  const order = await tx.order.findUnique({ where: { transactionId: payload.transactionId }, include: { fulfillment: { include: { session: true } } } });
  const session = order?.fulfillment?.session;
  if (!order || order.providerId !== payload.providerId || !session || request.data.sessionId !== session.id || (payload.session && payload.session.sessionId !== session.id))
    throw new DomainError("CALLBACK_CORRELATION_FAILED", "Charging session mismatch.", 409);
  const update = request.action === "update";
  if (update ? session.pendingRequestId !== request.messageId
    : !["CHARGING", "STOP_PENDING", "STOP_FAILED"].includes(session.state)) {
    await reconcile(tx, order.transactionId, `OUT_OF_ORDER:${payload.messageId}`);
    return "OUT_OF_ORDER";
  }
  if (payload.error) {
    if (update) await rejectCharging(tx, order.transactionId, request.messageId, payload.error);
    else await reconcile(tx, order.transactionId, `SESSION_STATUS:${session.id}`);
    return "PROVIDER_ERROR";
  }
  const reading = payload.session!;
  const measuredAt = new Date(reading.measuredAt);
  const stopping = request.data.command === "end-charging";
  const starting = request.data.command === "start-charging";
  if ((update && reading.state !== (stopping ? "COMPLETED" : "CHARGING")) ||
      (!update && reading.state !== "CHARGING") ||
      (session.measuredAt && measuredAt < session.measuredAt) ||
      (session.measuredAt && measuredAt.getTime() === session.measuredAt.getTime() && reading.energyWh !== session.energyWh) ||
      reading.energyWh < session.energyWh || measuredAt.getTime() > Date.now() + 30000 ||
      (starting && reading.energyWh !== 0)) {
    await reconcile(tx, order.transactionId, `INVALID_METER:${payload.messageId}`);
    return "INVALID_METER";
  }
  await tx.meterReading.upsert({
    where: { sessionId_measuredAt: { sessionId: session.id, measuredAt } },
    create: { sessionId: session.id, measuredAt, energyWh: reading.energyWh, messageId: payload.messageId }, update: {},
  });
  // Status callbacks cannot undo a pending/rejected stop.
  const state = update ? reading.state : session.state;
  await tx.chargingSession.update({ where: { id: session.id }, data: {
    state, energyWh: reading.energyWh, measuredAt,
    ...(starting ? { startedAt: measuredAt } : {}),
    ...(stopping ? { endedAt: measuredAt, nextPollAt: null } : { nextPollAt: new Date(Date.now() + 5000) }),
    ...(update ? { pendingRequestId: null } : {}),
  } });
  if (update) {
    await tx.fulfillment.update({ where: { id: session.fulfillmentId }, data: { state } });
    await tx.order.update({ where: { id: order.id }, data: { state } });
  }
  await tx.sessionEvent.create({ data: { sessionId: session.id, kind: update ? state : "METER_READING", detail: json(reading) } });
  await audit(tx, order.transactionId, order.userId, update ? state : "METER_READING", order.state, update ? state : order.state, reading);
  await tx.reconciliationIssue.updateMany({ where: { transactionId: order.transactionId, reason: `SESSION_STATUS:${session.id}` }, data: { resolvedAt: new Date() } });
  if (stopping) await prepareSettlement(tx, order.id);
  return "APPLIED";
}

export async function pollCharging(tx: Tx) {
  const sessions = await tx.chargingSession.findMany({
    where: { state: { in: ["CHARGING", "STOP_FAILED", "STOP_PENDING"] }, nextPollAt: { lte: new Date() } },
    include: { fulfillment: { include: { order: true } } }, take: 25,
  });
  for (const session of sessions) {
    const order = session.fulfillment.order;
    await enqueue(tx, order.transactionId, "status", order.providerId, {
      sessionId: session.id, startedAt: session.startedAt?.toISOString(), energyWh: session.energyWh,
    });
    await tx.chargingSession.update({ where: { id: session.id }, data: { nextPollAt: new Date(Date.now() + 10000) } });
  }
}
