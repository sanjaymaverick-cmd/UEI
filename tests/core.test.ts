import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  callbackSchema,
  fingerprint,
  resolvePaymentTerms,
  transition,
  paiseSchema,
  phoneSchema,
  secureEqual,
} from "../packages/domain/src/core";
import { parseConfig } from "../packages/config/src";

describe("order boundaries", () => {
  it("requires quote selection before initialization", () => {
    expect(transition("SELECT_PENDING", "on_select")).toBe("SELECTED");
    expect(transition("SELECTED", "init")).toBe("INIT_PENDING");
    expect(transition("INIT_PENDING", "on_init")).toBe("INITIALIZED");
    expect(() => transition("SELECT_PENDING", "on_init")).toThrow();
    expect(() => transition("INITIALIZED", "init")).toThrow();
  });
  it("requires authorized payment before order confirmation", () => {
    expect(transition("INITIALIZED", "pay")).toBe("PAYMENT_PENDING");
    expect(transition("PAYMENT_PENDING", "authorized")).toBe("CONFIRM_PENDING");
    expect(transition("CONFIRM_PENDING", "on_confirm")).toBe("CONFIRMED");
    expect(() => transition("INITIALIZED", "authorized")).toThrow();
    expect(() => transition("PAYMENT_PENDING", "on_confirm")).toThrow();
  });
  it("rejects fractional, negative and overflowing money", () => {
    for (const value of [1.1, -1, 2147483648, NaN, Infinity])
      expect(paiseSchema.safeParse(value).success).toBe(false);
    expect(paiseSchema.parse(25000)).toBe(25000);
  });
  it("requires explicit supported payment terms", () => {
    expect(
      resolvePaymentTerms({ collector: "BPP", method: "UPI", prepayment: true })
        .collector,
    ).toBe("BPP");
    expect(() =>
      resolvePaymentTerms({
        collector: "UNKNOWN",
        method: "UPI",
        prepayment: true,
      }),
    ).toThrow();
  });
});
describe("protocol validation and idempotency", () => {
  const base = {
    transactionId: randomUUID(),
    messageId: randomUUID(),
    requestMessageId: randomUUID(),
    providerId: "sim-a",
    action: "on_select",
  };
  it("requires correlated identifiers and action-specific contents", () => {
    expect(callbackSchema.safeParse(base).success).toBe(false);
    expect(
      callbackSchema.safeParse({ ...base, error: "Unavailable" }).success,
    ).toBe(true);
    expect(
      callbackSchema.safeParse({
        ...base,
        quote: {
          amountPaise: 25000,
          currency: "INR",
          expiresAt: new Date().toISOString(),
        },
      }).success,
    ).toBe(true);
    expect(
      callbackSchema.safeParse({
        ...base,
        providerId: "",
        error: "Unavailable",
      }).success,
    ).toBe(false);
  });
  it("requires confirmation details for on_confirm callbacks", () => {
    const confirm = { ...base, action: "on_confirm" };
    expect(callbackSchema.safeParse(confirm).success).toBe(false);
    expect(
      callbackSchema.safeParse({ ...confirm, error: "Unavailable" }).success,
    ).toBe(true);
    expect(
      callbackSchema.safeParse({
        ...confirm,
        confirmation: { providerOrderId: "sim-a-order-1" },
      }).success,
    ).toBe(true);
  });
  it("hashes object keys canonically while preserving values and array order", () => {
    expect(fingerprint({ a: 1, b: { c: 2 } })).toBe(
      fingerprint({ b: { c: 2 }, a: 1 }),
    );
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]));
  });
});
describe("security configuration", () => {
  const config = {
    DATABASE_URL: "postgresql://localhost/uei",
    AUTH_SECRET: "a".repeat(32),
    CALLBACK_SECRET: "b".repeat(32),
  };
  it("fails closed for production OTP and uncertified live protocol", () => {
    expect(() => parseConfig({ ...config, NODE_ENV: "production" })).toThrow();
    expect(() => parseConfig({ ...config, PROTOCOL_MODE: "live" })).toThrow();
    expect(parseConfig(config).PROTOCOL_MODE).toBe("simulator");
  });
  it("validates Indian mobile numbers and compares secret lengths safely", () => {
    expect(phoneSchema.safeParse("+919876543210").success).toBe(true);
    expect(phoneSchema.safeParse("+911234567890").success).toBe(false);
    expect(secureEqual("abc", "abc")).toBe(true);
    expect(secureEqual("abc", "abcd")).toBe(false);
  });
});
