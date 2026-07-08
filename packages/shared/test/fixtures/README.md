Golden fixture vectors for cross-language contracts — data both the
TypeScript (`packages/shared`) and PHP (`packages/plugin`) sides of a
signing scheme are tested against, so a drift between the two
implementations fails a test immediately instead of producing
silently-mismatched signatures at runtime.

- `work-order-hmac-vectors.json` — `{description, secret, payload,
  expectedCanonicalJson, expectedHmac}` entries. `expectedCanonicalJson` is
  what `canonicalizeForSigning`/`packages/shared/src/hmac.ts` must produce
  for `payload`; `expectedHmac` is `signPayload(payload, secret)`. PHP's
  `WorkOrderValidator.php` (Task A6.2) must produce the same two values for
  the same inputs — that test is what actually proves the two
  implementations agree, since PHP can't import this TS module directly.
