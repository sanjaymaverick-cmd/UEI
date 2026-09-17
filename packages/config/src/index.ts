import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  REDIS_URL: z.url().default("redis://localhost:6379"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default("127.0.0.1"),
  ADMIN_ORIGIN: z.url().default("http://localhost:5173"),
  AUTH_SECRET: z.string().min(32),
  CALLBACK_SECRET: z.string().min(32),
  OTP_PROVIDER: z.literal("development").default("development"),
  DEV_OTP: z
    .string()
    .regex(/^\d{6}$/)
    .default("123456"),
  PROTOCOL_MODE: z.enum(["simulator", "live"]).default("simulator"),
  SIMULATOR_SCENARIO: z
    .enum([
      "normal",
      "duplicate",
      "late",
      "missing",
      "nack",
      "callback-error",
      "out-of-order",
    ])
    .default("normal"),
  DISCOVERY_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120000)
    .default(10000),
  CALLBACK_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120000)
    .default(15000),
  ADMIN_PHONE: z
    .string()
    .regex(/^\+91[6-9]\d{9}$/)
    .default("+919999999999"),
});

export function parseConfig(env: Record<string, string | undefined>) {
  const value = schema.parse(env);
  if (value.NODE_ENV === "production")
    throw new Error(
      "Production is disabled: configure a real OTP provider and certified UEI integration first.",
    );
  if (value.PROTOCOL_MODE === "live")
    throw new Error(
      "Live UEI is disabled until the ONIX profile and trust configuration are validated.",
    );
  return value;
}
export type Config = ReturnType<typeof parseConfig>;
let cached: Config | undefined;
export const getConfig = () => (cached ??= parseConfig(process.env));
