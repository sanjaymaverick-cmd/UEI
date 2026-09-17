import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../packages/database/src";
import { CallbackService, ChargingService, DiscoveryService, OrderService, OutboxWorker, PaymentService, SettlementService, SimulatorAdapter, VehicleService } from "../packages/domain/src";
import { requestSchema, type ProtocolRequest } from "../packages/domain/src/protocol";
import { deliverPending, requireTestDatabase } from "./test-database";

const suite = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
suite("Charging and financial closure", () => {
  const worker = new OutboxWorker();
  const orders = new OrderService();
  const charging = new ChargingService();
  const callbacks = new CallbackService();
  let userId: string;
  let otherId: string;
  let adminId: string;
  let vehicleId: string;
  beforeAll(async () => {
    requireTestDatabase();
    const suffix = String(Date.now()).slice(-9);
    userId = (await db.user.create({ data: { phone: `+916${suffix}` } })).id;
    otherId = (await db.user.create({ data: { phone: `+917${suffix}` } })).id;
    adminId = (await db.user.create({ data: { phone: `+918${suffix}`, role: "ADMIN" } })).id;
    vehicleId = (await new VehicleService().save(userId, "nexon-demo", "Charging EV")).id;
  });
  afterAll(async () => { await db.$disconnect(); });
  async function confirmed() {
    const search = await new DiscoveryService().search(userId, { vehicleId, latitude: 12.97, longitude: 77.59 });
    await deliverPending(worker, search.transactionId);
    const results = await new DiscoveryService().results(userId, search.id);
    const order = await orders.create(userId, { vehicleId, discoveryResultId: results.results[0]!.id }, randomUUID());
    await deliverPending(worker, order.transactionId);
    await orders.init(userId, order.id, randomUUID());
    await deliverPending(worker, order.transactionId);
    await new PaymentService().pay(userId, order.id, randomUUID());
    await deliverPending(worker, order.transactionId);
    return orders.get(userId, order.id);
  }
  async function requestFor(transactionId: string, command: string) {
    const messages = await db.becknMessage.findMany({ where: { transactionId, action: "update", direction: "OUT" }, orderBy: { createdAt: "desc" } });
    return messages.map(m => requestSchema.parse(m.payload)).find(m => m.data.command === command)!;
  }
  async function hold(transactionId: string) {
    await db.outboxEvent.updateMany({ where: { transactionId, state: "PENDING" }, data: { state: "DONE" } });
  }
  async function meter(order: Awaited<ReturnType<typeof confirmed>>, energyWh: number) {
    // A separate provider status response supplies a deterministic final-meter fixture.
    const session = (await orders.get(userId, order.id)).fulfillment!.session!;
    await db.chargingSession.update({ where: { id: session.id }, data: { nextPollAt: new Date(0) } });
    await worker.tick();
    const message = await db.becknMessage.findFirstOrThrow({ where: { transactionId: order.transactionId, action: "status", direction: "OUT" }, orderBy: { createdAt: "desc" } });
    await hold(order.transactionId);
    await callbacks.receive({ transactionId: order.transactionId, providerId: order.providerId, messageId: randomUUID(), requestMessageId: message.messageId, action: "on_status", session: { sessionId: session.id, state: "CHARGING", energyWh, measuredAt: new Date().toISOString() } });
  }
  it("starts once, persists readings, stops, captures the bill, releases unused reserve and limits refunds", async () => {
    const order = await confirmed();
    const key = randomUUID();
    const [first, duplicate] = await Promise.all([charging.command(userId, order.id, "start-charging", key), charging.command(userId, order.id, "start-charging", key)]);
    expect(first.fulfillment?.session?.id).toBe(duplicate.fulfillment?.session?.id);
    expect(first.state).toBe("START_PENDING");
    await expect(charging.command(otherId, order.id, "start-charging", randomUUID())).rejects.toMatchObject({ status: 404 });
    await deliverPending(worker, order.transactionId);
    expect((await orders.get(userId, order.id)).state).toBe("CHARGING");
    await meter(order, 1000);
    const stopKey = randomUUID();
    await charging.command(userId, order.id, "end-charging", stopKey);
    await charging.command(userId, order.id, "end-charging", stopKey);
    await deliverPending(worker, order.transactionId);
    const completed = await orders.get(userId, order.id);
    expect(completed.state).toBe("COMPLETED");
    expect(completed.fulfillment?.session).toMatchObject({ state: "COMPLETED", energyWh: 1000 });
    expect(completed.payment).toMatchObject({ state: "SETTLED", capturedPaise: 2200, releasedPaise: 22800 });
    expect(completed.invoice).toMatchObject({ state: "ISSUED", totalPaise: 2200, mode: "SIMULATOR" });
    const incoming = await db.becknMessage.findFirstOrThrow({ where: { transactionId: order.transactionId, action: "on_update", direction: "IN" }, orderBy: { createdAt: "desc" } });
    expect((await callbacks.receive(incoming.payload)).duplicate).toBe(true);
    expect(await db.invoice.count({ where: { orderId: order.id } })).toBe(1);
    const settlement = new SettlementService();
    await expect(settlement.refund(userId, completed.payment!.id, 100, "test", randomUUID())).rejects.toMatchObject({ status: 403 });
    const refundKey = randomUUID();
    const refund = await settlement.refund(adminId, completed.payment!.id, 2000, "Demo support adjustment", refundKey);
    expect((await settlement.refund(adminId, completed.payment!.id, 2000, "Demo support adjustment", refundKey)).id).toBe(refund.id);
    await expect(settlement.refund(adminId, completed.payment!.id, 201, "over refund", randomUUID())).rejects.toMatchObject({ code: "INVALID_REFUND" });
    await deliverPending(worker, order.transactionId);
    expect((await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).state).toBe("REFUNDED");
  }, 20000);
  it("keeps a timed-out start pending and accepts a late correlated callback", async () => {
    const order = await confirmed();
    await charging.command(userId, order.id, "start-charging", randomUUID());
    const request = await requestFor(order.transactionId, "start-charging");
    await hold(order.transactionId);
    await db.order.update({ where: { id: order.id }, data: { updatedAt: new Date(0) } });
    await worker.tick();
    expect((await orders.get(userId, order.id)).needsReconciliation).toBe(true);
    expect((await orders.get(userId, order.id)).state).toBe("START_PENDING");
    await expect(charging.command(userId, order.id, "start-charging", randomUUID())).rejects.toMatchObject({ status: 409 });
    const payload = (await new SimulatorAdapter().submit(request)).callbacks[0]!.payload;
    await callbacks.receive(payload);
    expect((await orders.get(userId, order.id)).needsReconciliation).toBe(false);
    expect((await orders.get(userId, order.id)).state).toBe("CHARGING");
    await charging.command(userId, order.id, "end-charging", randomUUID());
    await deliverPending(worker, order.transactionId);
  }, 20000);
  it("does not treat a rejected stop as stopped and allows an explicit retry", async () => {
    class StopNack extends SimulatorAdapter {
      override async submit(request: ProtocolRequest) {
        return request.data.command === "end-charging" ? { ack: "NACK" as const, callbacks: [] } : super.submit(request);
      }
    }
    const order = await confirmed();
    await charging.command(userId, order.id, "start-charging", randomUUID());
    await deliverPending(worker, order.transactionId);
    await charging.command(userId, order.id, "end-charging", randomUUID());
    await deliverPending(new OutboxWorker(new StopNack()), order.transactionId);
    const rejected = await orders.get(userId, order.id);
    expect(rejected.state).toBe("CHARGING");
    expect(rejected.fulfillment?.session?.state).toBe("STOP_FAILED");
    expect(rejected.invoice).toBeNull();
    await charging.command(userId, order.id, "end-charging", randomUUID());
    await deliverPending(worker, order.transactionId);
    expect((await orders.get(userId, order.id)).state).toBe("COMPLETED");
  }, 20000);
  it("rejects regressing meter data and prevents settlement beyond authorization", async () => {
    const order = await confirmed();
    await charging.command(userId, order.id, "start-charging", randomUUID());
    await deliverPending(worker, order.transactionId);
    await meter(order, 20000);
    await meter(order, 1);
    expect((await orders.get(userId, order.id)).fulfillment?.session?.energyWh).toBe(20000);
    await charging.command(userId, order.id, "end-charging", randomUUID());
    await deliverPending(worker, order.transactionId);
    const completed = await orders.get(userId, order.id);
    expect(completed.state).toBe("COMPLETED");
    expect(completed.payment?.state).toBe("AUTHORIZED");
    expect(completed.invoice).toBeNull();
    expect(completed.needsReconciliation).toBe(true);
  }, 20000);
});
