// A9.2 / §14.2: "PII redacted before any LLM call: no email, no name, no IP,
// no order details." Track B's LLM router (Task B4, `LLMRequest` in
// llm.ts) doesn't exist yet, so there is no wired-in call site — this is
// the contract Track B's router is expected to call on `LLMRequest.input`
// before it ever gets serialized into a prompt, not an integration into
// code that doesn't exist. Also applicable anywhere else user/site data
// might reach a log line or third-party call (§15.3's "Never: sent to LLM,
// logged" column).
export const REDACTED = "[REDACTED]";

// Matches "the whole field is PII" cases: exact key match, not substring.
// Substring matching (e.g. anything containing "name") would also catch
// `plugin_name`, `site_name`, `action_name` — technical identifiers this
// system's own diagnosis logic (and Track B's eventual LLM prompts) needs,
// not personal data. A curated exact-match list is more precise than a
// blanket substring rule, at the cost of needing new entries added
// deliberately if a genuinely-PII-bearing field with a different name shows
// up later (e.g. a WooCommerce order payload).
const PII_FIELD_NAMES = new Set([
  "email",
  "customer_email",
  "billing_email",
  "name",
  "full_name",
  "first_name",
  "last_name",
  "customer_name",
  "billing_name",
  "shipping_name",
  "phone",
  "phone_number",
  "ip",
  "ip_address",
  "address",
  "billing_address",
  "shipping_address",
  "ssn",
  "social_security_number",
  "credit_card",
  "card_number",
  "customer",
  "billing",
  "shipping",
  "order_details",
]);

// Defense-in-depth for PII that shows up inside free-text string content
// regardless of which field it's under (a log message, an error stack, a
// user-typed note) — the field-name allowlist above only catches PII that
// arrived in a field labeled as such.
const EMAIL_PATTERN =
  /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;
const IPV4_PATTERN = /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b/g;
// Deliberately only matches "full" IPv6 (8 groups) or a compressed form with
// "::" — a shorter bare `\d{1,4}:\d{1,4}` pattern would false-positive on
// things like time ranges or ratios in ordinary text.
const IPV6_PATTERN = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:(?:[0-9a-fA-F]{1,4}:?){0,6}\b/g;

function redactString(value: string): string {
  return value.replace(EMAIL_PATTERN, REDACTED).replace(IPV4_PATTERN, REDACTED).replace(IPV6_PATTERN, REDACTED);
}

// Recursively walks arrays/objects; redacts by field name for objects, by
// pattern for every string value (including ones under a field name that
// wasn't in the allowlist — the whole point of the pattern net).
export function redactPII<T>(input: T): T {
  if (typeof input === "string") {
    return redactString(input) as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => redactPII(item)) as T;
  }
  if (input !== null && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = PII_FIELD_NAMES.has(key.toLowerCase()) ? REDACTED : redactPII(value);
    }
    return out as T;
  }
  return input;
}
