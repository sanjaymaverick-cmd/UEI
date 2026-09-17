import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApi } from "../apps/api/src/application";
import { db } from "../packages/database/src";
import { OutboxWorker } from "../packages/domain/src";
import { deliverPending, requireTestDatabase } from "./test-database";

const suite = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
suite("HTTP simulator journey", () => {
  let app: Awaited<ReturnType<typeof createApi>> | undefined;
  let base: string;
  let token: string;
  let otherToken: string;
  let adminToken: string;
  const worker = new OutboxWorker();

  async function request(
    path: string,
    body?: unknown,
    access = token,
    key?: string,
  ) {
    const response = await fetch(`${base}/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, body: await response.json() };
  }

  async function signIn(phone: string) {
    expect((await request("/auth/request-otp", { phone }, "")).status).toBe(
      200,
    );
    const result = await request(
      "/auth/verify-otp",
      {
        phone,
        otp: process.env.DEV_OTP ?? "123456",
      },
      "",
    );
    expect(result.status).toBe(200);
    return result.body;
  }

  async function deliver(transactionId: string) {
    await deliverPending(worker, transactionId);
  }

  beforeAll(async () => {
    requireTestDatabase();
    app = await createApi();
    await app.listen(0, "127.0.0.1");
    base = await app.getUrl();
    const suffix = String(Date.now()).slice(-9);
    const consumer = await signIn(`+916${suffix}`);
    token = consumer.accessToken;
    otherToken = (await signIn(`+917${suffix}`)).accessToken;
    const admin = await signIn(`+918${suffix}`);
    await db.user.update({
      where: { id: admin.user.id },
      data: { role: "ADMIN" },
    });
    adminToken = admin.accessToken;
  }, 15000);

  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
  });

  it("enforces authentication, strict input, admin access, and callback credentials", async () => {
    expect(await request("/orders", undefined, "")).toMatchObject({
      status: 401,
      body: { code: "AUTH_REQUIRED", retryable: false },
    });
    expect((await request("/admin/transactions")).status).toBe(403);
    expect((await request("/callbacks", {})).status).toBe(403);
    expect(
      await request("/vehicles", {
        variantId: "nexon-demo",
        nickname: "EV",
        role: "ADMIN",
      }),
    ).toMatchObject({
      status: 400,
      body: { code: "INVALID_INPUT", retryable: false },
    });
  });

  it("completes search/select/init and replays SSE while isolating users", async () => {
    const saved = await request("/vehicles", {
      variantId: "nexon-demo",
      nickname: "HTTP EV",
    });
    expect(saved.status).toBe(201);
    const vehicleId: string = saved.body.id;
    const search = await request("/charging/search", {
      vehicleId,
      latitude: 12.97,
      longitude: 77.59,
    });
    expect(search.status).toBe(201);
    await deliver(search.body.transactionId);
    const results = await request(`/charging/search/${search.body.id}/results`);
    expect(results.status).toBe(200);
    expect(results.body.results).toHaveLength(2);
    const input = { vehicleId, discoveryResultId: results.body.results[0].id };
    expect((await request("/orders", input)).status).toBe(400);
    const key = randomUUID();
    const order = await request("/orders", input, token, key);
    expect(order.status).toBe(201);
    expect((await request("/orders", input, token, key)).body.id).toBe(
      order.body.id,
    );
    expect(
      (
        await request(
          "/orders",
          { ...input, discoveryResultId: results.body.results[1].id },
          token,
          key,
        )
      ).status,
    ).toBe(409);
    await deliver(order.body.transactionId);
    const selected = await request(`/orders/${order.body.id}`);
    expect(selected.body.state).toBe("SELECTED");
    const initKey = randomUUID();
    expect(
      (await request(`/orders/${order.body.id}/init`, {}, token, initKey))
        .status,
    ).toBe(201);
    await deliver(order.body.transactionId);
    const initialized = await request(`/orders/${order.body.id}`);
    expect(initialized.body.state).toBe("INITIALIZED");
    expect(initialized.body.quotes).toEqual(selected.body.quotes);
    expect(initialized.body.paymentTerms).toMatchObject({
      collector: "BPP",
      method: "UPI",
    });
    const payKey = randomUUID();
    const paid = await request(
      `/orders/${order.body.id}/pay`,
      {},
      token,
      payKey,
    );
    expect(paid.status).toBe(201);
    expect(paid.body.state).toBe("PAYMENT_PENDING");
    expect(
      (await request(`/orders/${order.body.id}/pay`, {}, token, payKey)).body
        .id,
    ).toBe(order.body.id);
    await deliver(order.body.transactionId);
    const confirmed = await request(`/orders/${order.body.id}`);
    expect(confirmed.body.state).toBe("CONFIRMED");
    expect(confirmed.body.payment).toMatchObject({
      state: "AUTHORIZED",
      capability: "reserve_pay",
      method: "UPI",
    });
    for (const path of [
      `/orders/${order.body.id}`,
      `/charging/search/${search.body.id}/results`,
      `/transactions/${order.body.transactionId}/events`,
    ])
      expect((await request(path, undefined, otherToken)).status).toBe(404);

    const trace = await request(
      `/admin/transactions/${order.body.transactionId}`,
      undefined,
      adminToken,
    );
    expect(trace.status).toBe(200);
    expect(trace.body.messages).toHaveLength(6);
    expect(trace.body.payment).toMatchObject({ state: "AUTHORIZED" });
    const audit: { id: number; after: string | null }[] = trace.body.audit;
    const cursor = audit[0]!.id;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(
        `${base}/v1/transactions/${order.body.transactionId}/events`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Last-Event-ID": String(cursor),
          },
          signal: controller.signal,
        },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "text/event-stream",
      );
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let text = "";
      const lastId = audit.at(-1)!.id;
      while (!text.includes(`id: ${lastId}\n`)) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
      }
      const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((match) =>
        Number(match[1]),
      );
      expect(ids).toEqual(
        audit.filter((event) => event.id > cursor).map((event) => event.id),
      );
      expect(text).toContain('"state":"CONFIRMED"');
      await reader.cancel();
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  }, 15000);

  it("rotates credentials and rejects access after logout", async () => {
    const session = await signIn(`+919${String(Date.now()).slice(-9)}`);
    const refreshed = await request(
      "/auth/refresh",
      { refreshToken: session.refreshToken },
      "",
    );
    expect(refreshed.status).toBe(200);
    expect(
      (await request("/vehicles", undefined, session.accessToken)).status,
    ).toBe(401);
    expect(
      (await request("/vehicles", undefined, refreshed.body.accessToken))
        .status,
    ).toBe(200);
    expect(
      (
        await request(
          "/auth/logout",
          { refreshToken: refreshed.body.refreshToken },
          "",
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("/vehicles", undefined, refreshed.body.accessToken))
        .status,
    ).toBe(401);
  });
});
