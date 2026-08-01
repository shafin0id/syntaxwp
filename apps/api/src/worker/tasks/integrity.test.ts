import { describe, it, expect } from "vitest";
import { verifyManifestDelta } from "./integrity.js";

describe("verifyManifestDelta", () => {
  it("should isolate added, modified, and deleted files", () => {
    const baseline = {
      "wp-login.php": "hash_a",
      "wp-settings.php": "hash_b",
      "wp-config.php": "hash_c",
    };

    const current = {
      "wp-login.php": "hash_a_edited", // modified
      "wp-settings.php": "hash_b",        // unchanged
      "new-backdoor.php": "hash_d",       // added
    };

    const delta = verifyManifestDelta(baseline, current);

    expect(delta.added).toEqual(["new-backdoor.php"]);
    expect(delta.modified).toEqual(["wp-login.php"]);
    expect(delta.deleted).toEqual(["wp-config.php"]);
  });
});
