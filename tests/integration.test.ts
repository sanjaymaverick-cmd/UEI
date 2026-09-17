import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../packages/database/src";
import {
  AuthService,
  CallbackService,
  DiscoveryService,
  OrderService,
  OutboxWorker,
  PaymentOrchestrator,
  PaymentService,
  SimulatorAdapter,
  TraceService,
  VehicleService,
} from "../packages/domain/src";
import {
  requestSchema,
  type ProtocolRequest,
} from "../packages/domain/src/protocol";
import { deliverPending, requireTestDatabase } from "./test-database";

const suite = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
suite("PostgreSQL vertical slice and durability", () => {
  const auth = new AuthService();
  const vehicles = new VehicleService();
  const discovery = new DiscoveryService();
  const orders = new OrderService();
  const payments = new PaymentService();
  const worker = new OutboxWorker();
  const callbacks = new CallbackService();
  let userId: string;
  let vehicleId: string;
  let otherId: string;
  beforeAll(async () => {
    requireTestDatabase();
    await db.$connect();
    const suffix = String(Date.now()).slice(-9);
    const account = await db.user.create({ data: { phone: `+916${suffix}` } });
    userId = account.id;
    const other = await db.user.create({ data: { phone: `+917${suffix}` } });
    otherId = other.id;
    vehicleId = (await vehicles.save(userId, "nexon-demo", "Test EV")).id;
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  async function search() {
    const result = await discovery.search(userId, {
      vehicleId,
      latitude: 12.97,
      longitude: 77.59,
    });
    await deliverPending(worker, result.transactionId);
    return discovery.results(userId, result.id);
  }
  async function deliver(transactionId: string) {
    await deliverPending(worker, transactionId);
  }
  it("completes search/select/init with immutable quote and trace; rejects cross-user reads", async () => {
    const results = await search();
    expect(results.results).toHaveLength(2);
    expect(results.results.every((value) => value.connector === "CCS2")).toBe(
      true,
    );
    const key = randomUUID();
    const input = { discoveryResultId: results.results[0]!.id, vehicleId };
    const [first, replay] = await Promise.all([
      orders.create(userId, input, key),
      orders.create(userId, input, key),
    ]);
    expect(first.id).toBe(replay.id);
    await expect(
      orders.create(
        userId,
        { ...input, discoveryResultId: results.results[1]!.id },
        key,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await deliver(first.transactionId);
    const selected = await orders.get(userId, first.id);
    expect(selected.state).toBe("SELECTED");
    expect(selected.quotes).toHaveLength(1);
    const quoteId = selected.quotes[0]!.id;
    const incoming = await db.becknMessage.findFirstOrThrow({
      where: { transactionId: first.transactionId, direction: "IN" },
    });
    expect((await callbacks.receive(incoming.payload)).duplicate).toBe(true);
    await expect(
      callbacks.receive({
        ...(incoming.payload as object),
        quote: {
          amountPaise: 1,
          currency: "INR",
          expiresAt: new Date(Date.now() + 10000).toISOString(),
        },
      }),
    ).rejects.toMatchObject({ code: "CALLBACK_CONFLICT" });
    await orders.init(userId, first.id, randomUUID());
    await deliver(first.transactionId);
    const initialized = await orders.get(userId, first.id);
    expect(initialized.state).toBe("INITIALIZED");
    expect(initialized.quotes[0]!.id).toBe(quoteId);
    expect(initialized.paymentTerms).toMatchObject({
      collector: "BPP",
      method: "UPI",
    });
    const trace = await new TraceService().detail(first.transactionId);
    expect(trace.messages).toHaveLength(4);
    expect(trace.audit.some((event) => event.after === "INITIALIZED")).toBe(
      true,
    );
    await expect(orders.get(otherId, first.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(discovery.results(otherId, results.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      new TraceService().events(otherId, first.transactionId, 0),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("records out-of-order callbacks without advancing and reconciles missing/late callbacks", async () => {
    const results = await search();
    const order = await orders.create(
      userId,
      { discoveryResultId: results.results[0]!.id, vehicleId },
      randomUUID(),
    );
    const message = await db.becknMessage.findFirstOrThrow({
      where: { transactionId: order.transactionId, direction: "OUT" },
    });
    const request = requestSchema.parse(message.payload);
    const normal = (await new SimulatorAdapter().submit(request)).callbacks[0]!
      .payload;
    await callbacks.receive({
      transactionId: order.transactionId,
      messageId: randomUUID(),
      requestMessageId: request.messageId,
      providerId: order.providerId,
      action: "on_init",
      paymentTerms: { collector: "BPP", method: "UPI", prepayment: true },
    });
    expect((await orders.get(userId, order.id)).state).toBe("SELECT_PENDING");
    await db.outboxEvent.updateMany({
      where: { transactionId: order.transactionId },
      data: { state: "DONE" },
    });
    await db.order.update({
      where: { id: order.id },
      data: { updatedAt: new Date(0) },
    });
    await worker.tick();
    expect(
      await db.reconciliationIssue.count({
        where: {
          transactionId: order.transactionId,
          reason: { startsWith: "TIMEOUT:" },
          resolvedAt: null,
        },
      }),
    ).toBe(1);
    await callbacks.receive(normal);
    expect((await orders.get(userId, order.id)).state).toBe("SELECTED");
    expect(
      await db.reconciliationIssue.count({
        where: {
          transactionId: order.transactionId,
          reason: { startsWith: "TIMEOUT:" },
          resolvedAt: null,
        },
      }),
    ).toBe(0);
  });
  it("authorizes UPI payment via Reserve Pay and confirms the order", async () => {
    const results = await search();
    const order = await orders.create(
      userId,
      { discoveryResultId: results.results[0]!.id, vehicleId },
      randomUUID(),
    );
    await deliver(order.transactionId);
    await orders.init(userId, order.id, randomUUID());
    await deliver(order.transactionId);
    expect((await orders.get(userId, order.id)).state).toBe("INITIALIZED");
    const paid = await payments.pay(userId, order.id, randomUUID());
    expect(paid.state).toBe("PAYMENT_PENDING");
    expect(paid.payment?.state).toBe("AUTH_PENDING");
    await deliver(order.transactionId);
    const confirmed = await orders.get(userId, order.id);
    expect(confirmed.state).toBe("CONFIRMED");
    expect(confirmed.payment?.state).toBe("AUTHORIZED");
    expect(confirmed.payment?.capability).toBe("reserve_pay");
    expect(confirmed.payment?.amountPaise).toBe(25000);
    const trace = await new TraceService().detail(order.transactionId);
    expect(trace.payment?.state).toBe("AUTHORIZED");
    expect(trace.messages.some((m) => m.action === "confirm")).toBe(true);
    expect(trace.messages.some((m) => m.action === "on_confirm")).toBe(true);
  });
  it("fails the order when UPI authorization is declined", async () => {
    const decliningWorker = new OutboxWorker(
      new SimulatorAdapter(),
      new PaymentOrchestrator({
        authorize: async () => ({
          status: "FAILED",
          failureReason: "Test decline",
        }),
      }),
    );
    const results = await search();
    const order = await orders.create(
      userId,
      { discoveryResultId: results.results[0]!.id, vehicleId },
      randomUUID(),
    );
    await deliver(order.transactionId);
    await orders.init(userId, order.id, randomUUID());
    await deliver(order.transactionId);
    await payments.pay(userId, order.id, randomUUID());
    await deliverPending(decliningWorker, order.transactionId);
    const failed = await orders.get(userId, order.id);
    expect(failed.state).toBe("FAILED");
    expect(failed.payment?.state).toBe("FAILED");
  });
  it("fails the order when the provider NACKs confirmation after authorized payment", async () => {
    class ConfirmNackAdapter extends SimulatorAdapter {
      override async submit(request: ProtocolRequest) {
        if (request.action === "confirm")
          return { ack: "NACK" as const, callbacks: [] };
        return super.submit(request);
      }
    }
    const nackWorker = new OutboxWorker(new ConfirmNackAdapter());
    const results = await search();
    const order = await orders.create(
      userId,
      { discoveryResultId: results.results[0]!.id, vehicleId },
      randomUUID(),
    );
    await deliverPending(nackWorker, order.transactionId);
    await orders.init(userId, order.id, randomUUID());
    await deliverPending(nackWorker, order.transactionId);
    await payments.pay(userId, order.id, randomUUID());
    await deliverPending(nackWorker, order.transactionId);
    const failed = await orders.get(userId, order.id);
    expect(failed.state).toBe("FAILED");
    expect(failed.payment?.state).toBe("AUTHORIZED");
  });
  it("reconciles a payment stuck awaiting authorization past the callback timeout", async () => {
    const results = await search();
    const order = await orders.create(
      userId,
      { discoveryResultId: results.results[0]!.id, vehicleId },
      randomUUID(),
    );
    await deliver(order.transactionId);
    await orders.init(userId, order.id, randomUUID());
    await deliver(order.transactionId);
    await payments.pay(userId, order.id, randomUUID());
    await db.outboxEvent.updateMany({
      where: { transactionId: order.transactionId, kind: "PAYMENT_AUTH" },
      data: { state: "DONE" },
    });
    await db.payment.updateMany({
      where: { transactionId: order.transactionId },
      data: { updatedAt: new Date(0) },
    });
    await worker.tick();
    expect(
      await db.reconciliationIssue.count({
        where: {
          transactionId: order.transactionId,
          reason: { startsWith: "PAYMENT_TIMEOUT:" },
          resolvedAt: null,
        },
      }),
    ).toBe(1);
  });
  it("preserves state on transport ambiguity and never retries a lost external lease", async () => {
    const results = await search();
    const order = await orders.create(
      userId,
      { discoveryResultId: results.results[0]!.id, vehicleId },
      randomUUID(),
    );
    await db.outboxEvent.updateMany({
      where: { transactionId: order.transactionId },
      data: { state: "PROCESSING", leaseUntil: new Date(0) },
    });
    await worker.tick();
    expect((await orders.get(userId, order.id)).state).toBe("SELECT_PENDING");
    expect(
      await db.outboxEvent.count({
        where: { transactionId: order.transactionId, state: "UNCERTAIN" },
      }),
    ).toBe(1);
  });
  it("consumes OTPs, limits attempts and revokes a refresh family after replay", async () => {
    const phone = `+918${String(Date.now()).slice(-9)}`;
    await auth.requestOtp(phone);
    await expect(auth.requestOtp(phone)).rejects.toMatchObject({ status: 429 });
    await expect(auth.verifyOtp(phone, "000000")).rejects.toMatchObject({
      status: 401,
    });
    const session = await auth.verifyOtp(
      phone,
      process.env.DEV_OTP ?? "123456",
    );
    await expect(
      auth.verifyOtp(phone, process.env.DEV_OTP ?? "123456"),
    ).rejects.toMatchObject({ status: 401 });
    const rotated = await auth.refresh(session.refreshToken);
    await expect(auth.authenticate(session.accessToken)).rejects.toMatchObject({
      status: 401,
    });
    await expect(auth.refresh(session.refreshToken)).rejects.toMatchObject({
      status: 401,
    });
    await expect(auth.authenticate(rotated.accessToken)).rejects.toMatchObject({
      status: 401,
    });
    const stored = await db.userSession.findFirstOrThrow({
      where: { userId: session.user.id },
    });
    expect(stored.accessHash).not.toBe(session.accessToken);
  });
});
