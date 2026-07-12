import { describe, it, expect, vi } from "vitest";
import { binarySearchPluginConflict } from "./diagnostics.js";
import * as diagnostics from "./diagnostics.js";
import { db } from "@syntaxwp/db";

vi.mock("@syntaxwp/db", () => {
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ url: "http://mock-site.com" }]),
          }),
        }),
      }),
      update: vi.fn().mockImplementation(() => {
        return {
          set: vi.fn().mockImplementation(() => {
            return {
              where: vi.fn().mockResolvedValue([{}]),
            };
          }),
        };
      }),
    },
    pluginInventory: {
      slug: "slug",
      status: "status",
      siteId: "site_id",
    },
    sites: {
      id: "id",
      url: "url",
    },
  };
});

import * as healthChecker from "./verify-page-health.js";

vi.mock("./verify-page-health.js", () => {
  return {
    verifyPageHealth: vi.fn(),
  };
});

describe("binarySearchPluginConflict", () => {
  it("should isolate the culprit plugin in exactly O(log n) checks", async () => {
    const plugins = ["akismet", "contact-form-7", "woocommerce", "elementor", "yoast-seo"];
    const culprit = "woocommerce";

    let checkCount = 0;
    vi.spyOn(healthChecker, "verifyPageHealth").mockImplementation(async () => {
      checkCount++;
      // Check 1: [elementor, yoast-seo] disabled. woocommerce still active. returns false (broken)
      // Check 2: [woocommerce] disabled. woocommerce inactive. returns true (healthy)
      if (checkCount === 1) return false;
      if (checkCount === 2) return true;
      return true;
    });

    const result = await binarySearchPluginConflict(plugins, "site-id", "http://failing-url");
    
    expect(result).toBe(culprit);
    expect(checkCount).toBe(3); // 2 search checks + 1 final verification check
  });
});
