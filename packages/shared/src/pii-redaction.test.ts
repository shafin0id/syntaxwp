import { describe, expect, it } from "vitest";
import { redactPII, REDACTED } from "./pii-redaction.js";

describe("redactPII", () => {
  it("redacts an exact-match PII field name at the top level", () => {
    expect(redactPII({ email: "user@example.com", action: "flush_cache" })).toEqual({
      email: REDACTED,
      action: "flush_cache",
    });
  });

  it("does not touch technical fields that merely contain the substring 'name'", () => {
    const input = { plugin_name: "woocommerce", site_name: "Acme Store", action_name: "flush_cache" };
    expect(redactPII(input)).toEqual(input);
  });

  it("redacts nested PII fields at any depth", () => {
    const input = {
      incident: {
        reporter: { name: "Jane Doe", email: "jane@example.com" },
        action: "deactivate_plugin",
      },
    };
    expect(redactPII(input)).toEqual({
      incident: {
        reporter: { name: REDACTED, email: REDACTED },
        action: "deactivate_plugin",
      },
    });
  });

  it("redacts every element of an array of objects", () => {
    const input = [{ email: "a@example.com" }, { email: "b@example.com" }];
    expect(redactPII(input)).toEqual([{ email: REDACTED }, { email: REDACTED }]);
  });

  it("redacts an email address found inside free-text string content", () => {
    expect(redactPII({ summary: "Checkout failed for user@example.com at 2pm" })).toEqual({
      summary: `Checkout failed for ${REDACTED} at 2pm`,
    });
  });

  it("redacts an IPv4 address found inside free-text string content", () => {
    expect(redactPII({ log: "Request from 203.0.113.42 timed out" })).toEqual({
      log: `Request from ${REDACTED} timed out`,
    });
  });

  it("redacts a full-form IPv6 address found inside free-text string content", () => {
    expect(
      redactPII({ log: "Client 2001:0db8:0000:0000:0000:ff00:0042:8329 disconnected" }),
    ).toEqual({ log: `Client ${REDACTED} disconnected` });
  });

  it("redacts an entire 'customer'/'billing'/'shipping' sub-object outright", () => {
    const input = {
      order_id: "1234",
      customer: { name: "Jane Doe", email: "jane@example.com", loyalty_tier: "gold" },
    };
    expect(redactPII(input)).toEqual({ order_id: "1234", customer: REDACTED });
  });

  it("leaves non-PII primitives, numbers, booleans, and null untouched", () => {
    const input = { risk: "low", retries: 3, success: true, resolved_at: null };
    expect(redactPII(input)).toEqual(input);
  });

  it("is a no-op on a plain string with no PII patterns in it", () => {
    expect(redactPII("flush_cache completed successfully")).toBe("flush_cache completed successfully");
  });
});
