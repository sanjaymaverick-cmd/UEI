import { z } from "zod";
import { DomainError } from "./core";
import type { ProtocolRequest, ProtocolSubmission, UeiChargingProtocol } from "./protocol";
import { buildAuthorizationHeader, parseAuthorizationHeader, signBody, verifySignature } from "./becknSigning";

// Real Beckn-ONIX integration scaffolding. Nothing here is wired into the running app: no
// PROTOCOL_MODE=live path constructs this adapter, and `@uei/config` still refuses to start with
// PROTOCOL_MODE=live regardless. See infra/onix/README.md for what is still required before that
// changes, and packages/domain/src/becknSigning.ts for the signing convention this assumes.

// The subset of the Beckn Protocol `context` object this app needs to route and correlate
// messages. Field names and the exact core_version/domain string are per the network you join.
export const becknContextSchema = z.object({
  domain: z.string().min(1),
  country: z.string().length(3),
  city: z.string().min(1),
  action: z.enum(["search", "select", "init", "confirm", "update", "status"]),
  core_version: z.string().min(1),
  bap_id: z.string().min(1),
  bap_uri: z.url(),
  bpp_id: z.string().min(1).optional(),
  bpp_uri: z.url().optional(),
  transaction_id: z.uuid(),
  message_id: z.uuid(),
  timestamp: z.iso.datetime(),
  ttl: z.string().min(1),
});
export type BecknContext = z.infer<typeof becknContextSchema>;
export interface BecknEnvelope {
  context: BecknContext;
  // The exact `message` shape is defined by the network's official UEI schema for each action,
  // which this scaffolding does not have. Callers get the same normalized `data` the simulator
  // adapter receives; a real integration must replace this with the certified schema's payload
  // before going live, not just pass it through.
  message: Record<string, unknown>;
}

// Validates outgoing requests and incoming callbacks against the network's certified schemas.
// There is deliberately no default/permissive implementation: constructing OnixAdapter without
// one is a config error, not a silently-open door.
export interface SchemaValidator {
  validateRequest(envelope: BecknEnvelope): void;
  validateCallback(envelope: BecknEnvelope): void;
}

// Resolves a subscriber's registered signing public key so an inbound on_* callback's signature
// can be checked before anything in it is trusted. Backed by the Beckn/ONIX registry in a real
// deployment; there is no bundled implementation because that requires a real registry endpoint.
export interface SubscriberRegistry {
  lookupSigningPublicKey(subscriberId: string, uniqueKeyId: string): Promise<string>;
}

export const onixAdapterConfigSchema = z.object({
  gatewayUrl: z.url(),
  domain: z.string().min(1),
  countryCode: z.string().length(3),
  cityCode: z.string().min(1),
  coreVersion: z.string().min(1),
  bapSubscriberId: z.string().min(1),
  bapUri: z.url(),
  bapUniqueKeyId: z.string().min(1),
  signingPrivateKeyBase64: z.string().min(1),
  requestTtlSeconds: z.number().int().min(1).max(3600).default(30),
});
export type OnixAdapterConfig = z.infer<typeof onixAdapterConfigSchema>;

export class OnixAdapter implements UeiChargingProtocol {
  private readonly config: OnixAdapterConfig;
  constructor(
    config: unknown,
    private readonly schemaValidator: SchemaValidator,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    // Fails at construction on any missing/malformed field: no dummy keys or guessed endpoints
    // ever reach a network call.
    this.config = onixAdapterConfigSchema.parse(config);
  }
  private toEnvelope(request: ProtocolRequest): BecknEnvelope {
    return {
      context: {
        domain: this.config.domain,
        country: this.config.countryCode,
        city: this.config.cityCode,
        action: request.action,
        core_version: this.config.coreVersion,
        bap_id: this.config.bapSubscriberId,
        bap_uri: this.config.bapUri,
        transaction_id: request.transactionId,
        message_id: request.messageId,
        timestamp: request.timestamp,
        ttl: `PT${this.config.requestTtlSeconds}S`,
      },
      message: request.data,
    };
  }
  async submit(request: ProtocolRequest): Promise<ProtocolSubmission> {
    const envelope = this.toEnvelope(request);
    this.schemaValidator.validateRequest(envelope);
    const body = JSON.stringify(envelope);
    const signed = signBody(this.config.signingPrivateKeyBase64, body, this.config.requestTtlSeconds);
    const response = await this.fetchImpl(`${this.config.gatewayUrl}/${request.action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: buildAuthorizationHeader(
          this.config.bapSubscriberId,
          this.config.bapUniqueKeyId,
          signed,
        ),
      },
      body,
    });
    // A Beckn gateway/BPP acknowledges synchronously; the matching on_* result arrives later as a
    // separate, independently-signed callback to this BAP's own endpoint, not as this response.
    // There is nothing to schedule here — unlike the simulator, this adapter never returns
    // synthesized callbacks.
    return { ack: response.ok ? "ACK" : "NACK", callbacks: [] };
  }
}

// The inbound half of a live integration: verify an on_* callback's signature against the
// sender's registered key before mapping it into the domain's Callback shape. Not wired to any
// HTTP route yet — that needs the network's confirmed callback path and auth requirements first.
export async function verifyInboundCallback(
  authorizationHeader: string,
  rawBody: string,
  registry: SubscriberRegistry,
): Promise<void> {
  const parsed = parseAuthorizationHeader(authorizationHeader);
  const publicKey = await registry.lookupSigningPublicKey(parsed.subscriberId, parsed.uniqueKeyId);
  const valid = verifySignature(publicKey, rawBody, parsed);
  if (!valid)
    throw new DomainError("INVALID_SIGNATURE", "Callback signature verification failed.", 401);
}

// Placeholder mapping: copies the network's message body through as-is. A real integration must
// translate the certified on_* schema's fields into this domain's Callback shape (items, quote,
// paymentTerms, confirmation, session) here. The result is untyped on purpose — callers must run
// it through `callbackSchema.parse` (see ./core) to get a validated Callback, which is also where
// the SchemaValidator's own approval should be enforced before this is trusted.
// This function does not call `verifyInboundCallback` itself and nothing enforces the order —
// whoever wires this into a real HTTP route must call `verifyInboundCallback` on the raw body
// first and only map/trust the envelope after it resolves without throwing.
export function mapEnvelopeToCallback(
  envelope: BecknEnvelope,
  requestMessageId: string,
): Record<string, unknown> {
  return {
    transactionId: envelope.context.transaction_id,
    messageId: envelope.context.message_id,
    requestMessageId,
    providerId: envelope.context.bpp_id ?? "unknown",
    action: `on_${envelope.context.action}`,
    ...envelope.message,
  };
}
