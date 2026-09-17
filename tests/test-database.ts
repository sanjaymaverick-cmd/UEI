import { setTimeout } from "node:timers/promises";
import { db } from "../packages/database/src";
import { OutboxWorker } from "../packages/domain/src";

export function requireTestDatabase() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for database tests.");
  const url = new URL(value);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!name.includes("uei_test") || name.includes("/"))
    throw new Error("Use a dedicated database whose name contains uei_test.");
}

export async function deliverPending(
  worker: OutboxWorker,
  transactionId: string,
) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await worker.tick();
    await db.outboxEvent.updateMany({
      where: { transactionId, kind: "CALLBACK", state: "PENDING" },
      data: { availableAt: new Date(0) },
    });
    await worker.tick();
    const pending = await db.outboxEvent.count({
      where: { transactionId, state: { in: ["PENDING", "PROCESSING"] } },
    });
    if (!pending) return;
    await setTimeout(10);
  }
  throw new Error(`Outbox did not drain for test transaction ${transactionId}`);
}
