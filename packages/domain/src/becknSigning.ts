import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";
import { DomainError } from "./core";

// Ed25519 request signing as used across the Beckn protocol network (search/select/init/... and
// the matching on_* callbacks): a BLAKE2b-512 digest of the raw body, an IETF
// draft-cavage-http-signatures style signing string over (created)/(expires)/digest, and an
// Ed25519 signature over that string, carried in an `Authorization` (or `X-Gateway-Authorization`)
// header. This module implements that shape from the public Beckn Protocol Network signing
// convention. It has not been run against a real ONIX gateway or checked byte-for-byte against a
// specific network's signing spec revision — verify header casing, the exact signing-string
// content and the digest algorithm label against the authoritative spec for the network you are
// joining before relying on this for real interoperability. See infra/onix/README.md.

// Raw 32-byte Ed25519 keys, base64-encoded — the convention Beckn/ONDC registries use for
// `signing_public_key`. Node's crypto only speaks PKCS8/SPKI DER (or JWK, which for OKP keys
// insists on carrying both halves together), so raw keys are wrapped in the fixed-size ASN.1
// prefix for Ed25519 to get a KeyObject.
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export interface Ed25519KeyPair {
  publicKeyBase64: string;
  privateKeyBase64: string;
}

// For local development/testing only. A real subscriber's signing key is issued and registered
// through the Beckn/ONIX registry onboarding process, not generated ad hoc here.
export function generateSigningKeyPair(): Ed25519KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  const privateDer = privateKey.export({ format: "der", type: "pkcs8" });
  return {
    publicKeyBase64: publicDer.subarray(SPKI_ED25519_PREFIX.length).toString("base64"),
    privateKeyBase64: privateDer.subarray(PKCS8_ED25519_PREFIX.length).toString("base64"),
  };
}

function importPrivateKey(privateKeyBase64: string) {
  const raw = Buffer.from(privateKeyBase64, "base64");
  if (raw.length !== 32) throw new DomainError("INVALID_SIGNING_KEY", "Ed25519 private key must be 32 raw bytes.");
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, raw]), format: "der", type: "pkcs8" });
}
function importPublicKey(publicKeyBase64: string) {
  const raw = Buffer.from(publicKeyBase64, "base64");
  if (raw.length !== 32) throw new DomainError("INVALID_SIGNING_KEY", "Ed25519 public key must be 32 raw bytes.");
  return createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, raw]), format: "der", type: "spki" });
}

export function digestBody(body: string): string {
  return createHash("blake2b512").update(body, "utf8").digest("base64");
}

function signingString(created: string, expires: string, digest: string): string {
  return `(created): ${created}\n(expires): ${expires}\ndigest: BLAKE-512=${digest}`;
}

export interface SignedRequest {
  signatureBase64: string;
  created: string;
  expires: string;
  digestBase64: string;
}

export function signBody(
  privateKeyBase64: string,
  body: string,
  ttlSeconds = 300,
): SignedRequest {
  const now = Math.floor(Date.now() / 1000);
  const created = String(now);
  const expires = String(now + ttlSeconds);
  const digestBase64 = digestBody(body);
  const message = Buffer.from(signingString(created, expires, digestBase64), "utf8");
  const signatureBase64 = edSign(null, message, importPrivateKey(privateKeyBase64)).toString("base64");
  return { signatureBase64, created, expires, digestBase64 };
}

export function verifySignature(
  publicKeyBase64: string,
  body: string,
  signed: Pick<SignedRequest, "created" | "expires" | "signatureBase64">,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  const created = Number(signed.created);
  const expires = Number(signed.expires);
  if (!Number.isFinite(created) || !Number.isFinite(expires) || now < created || now > expires)
    return false;
  const digestBase64 = digestBody(body);
  const message = Buffer.from(signingString(signed.created, signed.expires, digestBase64), "utf8");
  try {
    return edVerify(
      null,
      message,
      importPublicKey(publicKeyBase64),
      Buffer.from(signed.signatureBase64, "base64"),
    );
  } catch {
    return false;
  }
}

export function buildAuthorizationHeader(
  subscriberId: string,
  uniqueKeyId: string,
  signed: SignedRequest,
): string {
  return (
    `Signature keyId="${subscriberId}|${uniqueKeyId}|ed25519",algorithm="ed25519",` +
    `created="${signed.created}",expires="${signed.expires}",` +
    `headers="(created) (expires) digest",signature="${signed.signatureBase64}"`
  );
}

export interface ParsedAuthorizationHeader {
  subscriberId: string;
  uniqueKeyId: string;
  created: string;
  expires: string;
  signatureBase64: string;
}

export function parseAuthorizationHeader(header: string): ParsedAuthorizationHeader {
  const fields: Record<string, string> = {};
  for (const match of header.matchAll(/(\w+)="([^"]*)"/g)) fields[match[1]!] = match[2]!;
  const keyId = fields.keyId;
  const parts = keyId?.split("|");
  if (!parts || parts.length !== 3 || !fields.created || !fields.expires || !fields.signature)
    throw new DomainError("INVALID_SIGNATURE", "Malformed Authorization header.", 400);
  return {
    subscriberId: parts[0]!,
    uniqueKeyId: parts[1]!,
    created: fields.created,
    expires: fields.expires,
    signatureBase64: fields.signature,
  };
}
