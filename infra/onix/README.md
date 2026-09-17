# Live UEI integration boundary

The runnable default is the local simulator. Its envelope is deliberately marked `simulator-1` and is not a certified UEI payload.

Before enabling a real network, supply the exact UEI profile/version and official schemas, BAP identity/URI, ONIX image digest and configuration, registry/trust material, routing targets, callback verification contract, and sandbox credentials. Implement a versioned adapter behind `UeiChargingProtocol`, map callback envelopes into the validated domain contract, and run provider conformance tests. ONIX must own signing, signature verification, schema validation and routing.

`PROTOCOL_MODE=live` fails at startup. No dummy signing keys, guessed network endpoints, or permissive live callback verification are shipped. `/v1/callbacks` is a secret-protected normalized simulator ingress only.

## Scaffolding added (2026-09-17), still not wired in

`packages/domain/src/becknSigning.ts` and `packages/domain/src/onix.ts` implement the parts of a
real integration that don't depend on network-specific secrets:

- **Signing**: Ed25519 sign/verify over a BLAKE2b-512 body digest, in the IETF
  draft-cavage-http-signatures shape the Beckn protocol network uses, plus an
  `Authorization`-header builder/parser. Unit-tested (round trip, tamper detection, expiry) in
  `tests/onix.test.ts`. **Not checked byte-for-byte against an authoritative signing spec
  document for a specific network** — verify the exact signing-string content, digest algorithm
  label, and header name before relying on this for real interop.
- **`OnixAdapter`**: a `UeiChargingProtocol` implementation that maps the internal request into a
  Beckn `context`/`message` envelope, signs it, and POSTs it to a configured gateway URL,
  returning `{ack, callbacks: []}` — real Beckn callbacks arrive later, asynchronously, at this
  BAP's own endpoint, not as this response. Its `message` body is a pass-through of the internal
  request's data, **not the certified UEI schema payload** — that mapping still needs the real
  schema.
- `verifyInboundCallback` / `mapEnvelopeToCallback`: the inbound half (signature check via an
  injected `SubscriberRegistry` lookup, then mapping into the domain's `Callback` shape). Not
  wired to any HTTP route — the real callback path/URL and auth requirements come from the
  network you join.

None of this is reachable from the running app: nothing constructs `OnixAdapter` in
`apps/api`/`apps/worker`, and `@uei/config` still refuses to start with `PROTOCOL_MODE=live`
regardless. Turning it on for real still requires everything in the paragraph above, plus:

1. A real `SchemaValidator` built from the network's certified JSON schemas (there is no
   permissive default — `OnixAdapter`'s constructor requires one).
2. A real `SubscriberRegistry` backed by the actual Beckn/ONIX registry endpoint.
3. Confirming the signing-string/digest details above against that network's spec.
4. Wiring an inbound webhook route once the callback path is known, and constructing
   `OnixAdapter` from real config in place of `SimulatorAdapter`.
