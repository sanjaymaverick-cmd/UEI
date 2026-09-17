# Live UEI integration boundary

The runnable default is the local simulator. Its envelope is deliberately marked `simulator-1` and is not a certified UEI payload.

Before enabling a real network, supply the exact UEI profile/version and official schemas, BAP identity/URI, ONIX image digest and configuration, registry/trust material, routing targets, callback verification contract, and sandbox credentials. Implement a versioned adapter behind `UeiChargingProtocol`, map callback envelopes into the validated domain contract, and run provider conformance tests. ONIX must own signing, signature verification, schema validation and routing.

`PROTOCOL_MODE=live` fails at startup. No dummy signing keys, guessed network endpoints, or permissive live callback verification are shipped. `/v1/callbacks` is a secret-protected normalized simulator ingress only.
