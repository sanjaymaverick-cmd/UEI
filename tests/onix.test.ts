import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  buildAuthorizationHeader,
  generateSigningKeyPair,
  parseAuthorizationHeader,
  signBody,
  verifySignature,
} from "../packages/domain/src/becknSigning";
import { OnixAdapter, mapEnvelopeToCallback, type SchemaValidator } from "../packages/domain/src/onix";
import type { ProtocolRequest } from "../packages/domain/src/protocol";

describe("Beckn Ed25519 request signing", () => {
  it("signs and verifies a body round trip", () => {
    const { publicKeyBase64, privateKeyBase64 } = generateSigningKeyPair();
    const body = JSON.stringify({ hello: "world" });
    const signed = signBody(privateKeyBase64, body);
    expect(verifySignature(publicKeyBase64, body, signed)).toBe(true);
  });
  it("rejects a tampered body or signature", () => {
    const { publicKeyBase64, privateKeyBase64 } = generateSigningKeyPair();
    const signed = signBody(privateKeyBase64, JSON.stringify({ hello: "world" }));
    expect(verifySignature(publicKeyBase64, JSON.stringify({ hello: "tampered" }), signed)).toBe(false);
    expect(verifySignature(publicKeyBase64, JSON.stringify({ hello: "world" }), { ...signed, signatureBase64: signed.signatureBase64.slice(0, -4) + "abcd" })).toBe(false);
  });
  it("rejects a different keypair's signature", () => {
    const a = generateSigningKeyPair();
    const b = generateSigningKeyPair();
    const body = JSON.stringify({ hello: "world" });
    const signed = signBody(a.privateKeyBase64, body);
    expect(verifySignature(b.publicKeyBase64, body, signed)).toBe(false);
  });
  it("rejects an expired signature window", () => {
    const { publicKeyBase64, privateKeyBase64 } = generateSigningKeyPair();
    const body = "{}";
    const signed = signBody(privateKeyBase64, body, -1);
    expect(verifySignature(publicKeyBase64, body, signed)).toBe(false);
  });
  it("round trips through the Authorization header", () => {
    const { privateKeyBase64 } = generateSigningKeyPair();
    const signed = signBody(privateKeyBase64, "{}");
    const header = buildAuthorizationHeader("bap-1", "key-1", signed);
    expect(parseAuthorizationHeader(header)).toEqual({
      subscriberId: "bap-1",
      uniqueKeyId: "key-1",
      created: signed.created,
      expires: signed.expires,
      signatureBase64: signed.signatureBase64,
    });
  });
  it("rejects a malformed Authorization header", () => {
    expect(() => parseAuthorizationHeader("garbage")).toThrow();
  });
});

const validConfig = {
  gatewayUrl: "https://gateway.example",
  domain: "uei:charging",
  countryCode: "IND",
  cityCode: "std:080",
  coreVersion: "1.1.0",
  bapSubscriberId: "bap.example",
  bapUri: "https://bap.example",
  bapUniqueKeyId: "key-1",
  signingPrivateKeyBase64: generateSigningKeyPair().privateKeyBase64,
};
const permissiveValidator: SchemaValidator = { validateRequest: () => {}, validateCallback: () => {} };

describe("OnixAdapter (not wired into the running app)", () => {
  it("refuses to construct with a missing required field", () => {
    const incomplete: Record<string, unknown> = { ...validConfig };
    delete incomplete.gatewayUrl;
    expect(() => new OnixAdapter(incomplete, permissiveValidator)).toThrow();
  });
  it("signs, sends, and returns an ack-only submission with no synthesized callbacks", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const adapter = new OnixAdapter(validConfig, permissiveValidator, fetchImpl as unknown as typeof fetch);
    const request: ProtocolRequest = {
      transactionId: randomUUID(),
      messageId: randomUUID(),
      action: "search",
      providerId: "sim-a",
      data: { latitude: 12.97, longitude: 77.59 },
      timestamp: new Date().toISOString(),
      version: "simulator-1",
    };
    const submission = await adapter.submit(request);
    expect(submission).toEqual({ ack: "ACK", callbacks: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://gateway.example/search");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Signature keyId="bap\.example\|key-1\|ed25519"/);
    const body = JSON.parse(init!.body as string);
    expect(body.context).toMatchObject({ action: "search", bap_id: "bap.example", transaction_id: request.transactionId });
    expect(body.message).toEqual(request.data);
  });
  it("returns NACK when the gateway rejects the request", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 400 }));
    const adapter = new OnixAdapter(validConfig, permissiveValidator, fetchImpl as unknown as typeof fetch);
    const submission = await adapter.submit({
      transactionId: randomUUID(),
      messageId: randomUUID(),
      action: "search",
      providerId: "sim-a",
      data: {},
      timestamp: new Date().toISOString(),
      version: "simulator-1",
    });
    expect(submission).toEqual({ ack: "NACK", callbacks: [] });
  });
  it("rejects a request the schema validator does not accept", async () => {
    const validator: SchemaValidator = {
      validateRequest: () => { throw new Error("schema rejected"); },
      validateCallback: () => {},
    };
    const adapter = new OnixAdapter(validConfig, validator, vi.fn() as unknown as typeof fetch);
    await expect(adapter.submit({
      transactionId: randomUUID(), messageId: randomUUID(), action: "search",
      providerId: "sim-a", data: {}, timestamp: new Date().toISOString(), version: "simulator-1",
    })).rejects.toThrow("schema rejected");
  });
});

describe("mapEnvelopeToCallback", () => {
  it("carries the correlation fields through for later validation", () => {
    const requestMessageId = randomUUID();
    const result = mapEnvelopeToCallback({
      context: {
        domain: "uei:charging", country: "IND", city: "std:080", action: "search",
        core_version: "1.1.0", bap_id: "bap.example", bap_uri: "https://bap.example",
        bpp_id: "bpp.example", transaction_id: randomUUID(), message_id: randomUUID(),
        timestamp: new Date().toISOString(), ttl: "PT30S",
      },
      message: { items: [] },
    }, requestMessageId);
    expect(result).toMatchObject({ requestMessageId, providerId: "bpp.example", action: "on_search", items: [] });
  });
});
