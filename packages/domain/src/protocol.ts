import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getConfig } from "@uei/config";
import type { Callback } from "./core";

export const requestSchema = z.object({
  transactionId: z.uuid(),
  messageId: z.uuid(),
  action: z.enum(["search", "select", "init", "confirm", "update", "status"]),
  providerId: z.string(),
  data: z.record(z.string(), z.unknown()),
  timestamp: z.iso.datetime(),
  version: z.literal("simulator-1"),
});
export type ProtocolRequest = z.infer<typeof requestSchema>;
export interface ProtocolSubmission {
  ack: "ACK" | "NACK";
  callbacks: { payload: Callback; delayMs: number }[];
}
export interface UeiChargingProtocol {
  submit(request: ProtocolRequest): Promise<ProtocolSubmission>;
}
export class BecknContextFactory {
  create(
    transactionId: string,
    action: ProtocolRequest["action"],
    providerId: string,
    data: Record<string, unknown>,
  ): ProtocolRequest {
    return {
      transactionId,
      messageId: randomUUID(),
      action,
      providerId,
      data,
      timestamp: new Date().toISOString(),
      version: "simulator-1",
    };
  }
}
// Intentionally a normalized simulator contract, not a claimed live Beckn profile.
export class SimulatorAdapter implements UeiChargingProtocol {
  async submit(request: ProtocolRequest): Promise<ProtocolSubmission> {
    const config = getConfig();
    const scenario = config.SIMULATOR_SCENARIO;
    if (scenario === "nack") return { ack: "NACK", callbacks: [] };
    if (scenario === "missing") return { ack: "ACK", callbacks: [] };
    const providers =
      request.action === "search" ? ["sim-a", "sim-b"] : [request.providerId];
    const callbacks = providers.map((providerId, index) => {
      const payload: Callback = {
        transactionId: request.transactionId,
        messageId: randomUUID(),
        requestMessageId: request.messageId,
        providerId,
        action: `on_${request.action}`,
      };
      if (request.action === "search")
        payload.items = [
          {
            itemId: `${providerId}-ccs`,
            name: `Demo charging station ${index + 1}`,
            connector: "CCS2",
            pricePaise: 2200,
            latitude: Number(request.data.latitude),
            longitude: Number(request.data.longitude),
          },
          {
            itemId: `${providerId}-chademo`,
            name: "Demo CHAdeMO station",
            connector: "CHADEMO",
            pricePaise: 2000,
            latitude: Number(request.data.latitude),
            longitude: Number(request.data.longitude),
          },
        ];
      if (request.action === "select")
        payload.quote = {
          amountPaise: 25000,
          currency: "INR",
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        };
      if (request.action === "init")
        payload.paymentTerms = {
          collector: "BPP",
          method: "UPI",
          prepayment: true,
          maximumAuthorizationPaise: 25000,
        };
      if (request.action === "confirm")
        payload.confirmation = {
          providerOrderId: `${providerId}-${String(request.data.orderId ?? "order")}`,
        };
      if (request.action === "update" || request.action === "status") {
        const now = Date.now();
        const startedAt = typeof request.data.startedAt === "string"
          ? new Date(request.data.startedAt).getTime() : now;
        payload.session = {
          sessionId: String(request.data.sessionId),
          state: request.data.command === "end-charging" ? "COMPLETED" : "CHARGING",
          energyWh: Math.max(Number(request.data.energyWh ?? 0), Math.floor(Math.max(0, now - startedAt) * 11000 / 3600000)),
          measuredAt: new Date(now).toISOString(),
        };
      }
      if (scenario === "callback-error")
        payload.error = "Simulated provider rejection";
      return {
        payload,
        delayMs:
          scenario === "late"
            ? Math.max(config.CALLBACK_TIMEOUT_MS, config.DISCOVERY_WINDOW_MS) +
              3000
            : 500 + index * 500,
      };
    });
    if (scenario === "out-of-order" && request.action === "select")
      callbacks.unshift({
        payload: {
          transactionId: request.transactionId,
          messageId: randomUUID(),
          requestMessageId: request.messageId,
          providerId: request.providerId,
          action: "on_init",
          paymentTerms: { collector: "BPP", method: "UPI", prepayment: true },
        },
        delayMs: 100,
      });
    if (scenario === "duplicate")
      callbacks.push(
        ...callbacks.map((value) => ({
          ...value,
          delayMs: value.delayMs + 200,
        })),
      );
    return { ack: "ACK", callbacks };
  }
}
