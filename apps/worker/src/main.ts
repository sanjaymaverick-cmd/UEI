import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Queue, Worker } from "bullmq";
import { getConfig } from "@uei/config";
import { OutboxWorker } from "@uei/domain";

@Module({})
class WorkerModule {}
async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  const config = getConfig();
  const pump = new OutboxWorker();
  const url = new URL(config.REDIS_URL);
  const connection = {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
  const queue = new Queue("uei-outbox", { connection });
  const worker = new Worker("uei-outbox", async () => pump.tick(), {
    connection,
  });
  worker.on("error", () =>
    console.error("Worker queue unavailable; database polling remains active."),
  );
  queue.on("error", () => {});
  void queue
    .upsertJobScheduler("outbox-tick", { every: 1000 }, { name: "drain" })
    .catch(() => {});
  const timer = setInterval(() => {
    void pump
      .tick()
      .catch(() => console.error("Outbox poll failed; retrying on next tick."));
  }, 1000);
  const stop = async () => {
    clearInterval(timer);
    await worker.close();
    await queue.close();
    await app.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}
void main();
