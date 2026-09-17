import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public retryable = false,
  ) {
    super(message);
  }
}
export const phoneSchema = z.string().regex(/^\+91[6-9]\d{9}$/);
export const idSchema = z.uuid();
export const keySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[\w-]+$/);
export const connectorSchema = z.enum([
  "CCS2",
  "TYPE2",
  "CHADEMO",
  "BHARAT_AC",
  "BHARAT_DC",
]);
export const paiseSchema = z.number().int().min(0).max(2147483647);
export const coordinates = {
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
};
export const newToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string, secret: string) =>
  createHmac("sha256", secret).update(token).digest("hex");
export function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const fingerprint = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export function transition(
  state: string,
  action:
    "on_select" | "init" | "on_init" | "pay" | "authorized" | "on_confirm",
) {
  const allowed: Record<string, [string, string]> = {
    on_select: ["SELECT_PENDING", "SELECTED"],
    init: ["SELECTED", "INIT_PENDING"],
    on_init: ["INIT_PENDING", "INITIALIZED"],
    pay: ["INITIALIZED", "PAYMENT_PENDING"],
    authorized: ["PAYMENT_PENDING", "CONFIRM_PENDING"],
    on_confirm: ["CONFIRM_PENDING", "CONFIRMED"],
  };
  const [from, to] = allowed[action]!;
  if (state !== from)
    throw new DomainError(
      "INVALID_TRANSITION",
      `Cannot apply ${action} to ${state}.`,
      409,
    );
  return to;
}
export const paymentTermsSchema = z
  .object({
    collector: z.enum(["BAP", "BPP"]),
    method: z.literal("UPI"),
    prepayment: z.boolean(),
    maximumAuthorizationPaise: paiseSchema.optional(),
  })
  .strict();
export function resolvePaymentTerms(raw: unknown) {
  return paymentTermsSchema.parse(raw);
}
export const itemSchema = z
  .object({
    itemId: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    connector: connectorSchema,
    pricePaise: paiseSchema,
    ...coordinates,
  })
  .strict();
export const confirmationSchema = z
  .object({ providerOrderId: z.string().min(1).max(200) })
  .strict();
export const callbackSchema = z
  .object({
    transactionId: idSchema,
    messageId: idSchema,
    requestMessageId: idSchema,
    providerId: z.string().min(1).max(100),
    action: z.enum(["on_search", "on_select", "on_init", "on_confirm"]),
    items: z.array(itemSchema).max(100).optional(),
    quote: z
      .object({
        amountPaise: paiseSchema,
        currency: z.literal("INR"),
        expiresAt: z.iso.datetime(),
      })
      .strict()
      .optional(),
    paymentTerms: paymentTermsSchema.optional(),
    confirmation: confirmationSchema.optional(),
    error: z.string().min(1).max(500).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.error) return;
    const key = {
      on_search: "items",
      on_select: "quote",
      on_init: "paymentTerms",
      on_confirm: "confirmation",
    }[value.action] as "items" | "quote" | "paymentTerms" | "confirmation";
    if (!value[key])
      ctx.addIssue({ code: "custom", message: `Missing ${key}`, path: [key] });
  });
export type Callback = z.infer<typeof callbackSchema>;
