import { randomUUID } from "node:crypto";
import { z } from "zod";
import { atomic } from "@uei/database";
import { getConfig } from "@uei/config";
import {
  DomainError,
  paiseSchema,
  resolvePaymentTerms,
  transition,
} from "./core";
import { audit, existingCommand, json, rememberCommand } from "./persistence";
import { OrderService } from "./orders";

export const paymentAuthPayloadSchema = z
  .object({
    paymentId: z.uuid(),
    orderId: z.uuid(),
    amountPaise: paiseSchema,
    method: z.literal("UPI"),
    capability: z.enum(["standard", "reserve_pay"]),
  })
  .strict();
export type PaymentAuthPayload = z.infer<typeof paymentAuthPayloadSchema>;

export interface PaymentAuthorizationResult {
  status: "AUTHORIZED" | "FAILED";
  providerReference?: string;
  failureReason?: string;
}
export interface PaymentProviderAdapter {
  authorize(input: PaymentAuthPayload): Promise<PaymentAuthorizationResult>;
}
// Illustrative UPI simulator, not a certified NPCI/Reserve Pay integration.
export class SimulatorUpiAdapter implements PaymentProviderAdapter {
  async authorize(
    input: PaymentAuthPayload,
  ): Promise<PaymentAuthorizationResult> {
    const config = getConfig();
    if (config.SIMULATOR_SCENARIO === "nack")
      return { status: "FAILED", failureReason: "Simulated UPI decline" };
    return {
      status: "AUTHORIZED",
      providerReference: `sim-upi-${input.capability}-${randomUUID()}`,
    };
  }
}
export class PaymentOrchestrator {
  constructor(
    private readonly adapter: PaymentProviderAdapter = new SimulatorUpiAdapter(),
  ) {}
  authorize(input: PaymentAuthPayload) {
    return this.adapter.authorize(input);
  }
}
export class PaymentService {
  async pay(userId: string, orderId: string, key: string) {
    await atomic(async (tx) => {
      if (await existingCommand(tx, userId, "pay", key, { orderId })) return;
      const order = await tx.order.findFirst({
        where: { id: orderId, userId },
        include: { quotes: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      if (!order) throw new DomainError("NOT_FOUND", "Order not found.", 404);
      const terms = resolvePaymentTerms(order.paymentTerms);
      const quote = order.quotes[0]!;
      const capability =
        terms.maximumAuthorizationPaise !== undefined
          ? "reserve_pay"
          : "standard";
      const amountPaise =
        capability === "reserve_pay"
          ? terms.maximumAuthorizationPaise!
          : quote.amountPaise;
      const state = transition(order.state, "pay");
      await tx.order.update({ where: { id: orderId }, data: { state } });
      const payment = await tx.payment.create({
        data: {
          orderId,
          transactionId: order.transactionId,
          userId,
          method: terms.method,
          collector: terms.collector,
          capability,
          amountPaise,
          state: "AUTH_PENDING",
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentId: payment.id,
          kind: "AUTH_REQUESTED",
          detail: json({ amountPaise, capability }),
        },
      });
      await tx.outboxEvent.create({
        data: {
          transactionId: order.transactionId,
          messageId: randomUUID(),
          kind: "PAYMENT_AUTH",
          payload: json({
            paymentId: payment.id,
            orderId,
            amountPaise,
            method: terms.method,
            capability,
          } satisfies PaymentAuthPayload),
        },
      });
      await audit(
        tx,
        order.transactionId,
        userId,
        "PAYMENT_REQUESTED",
        "INITIALIZED",
        state,
        { paymentId: payment.id, amountPaise, capability },
      );
      await rememberCommand(tx, userId, "pay", key, { orderId }, orderId);
    });
    return new OrderService().get(userId, orderId);
  }
}
