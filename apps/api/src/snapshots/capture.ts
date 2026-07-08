import { createSnapshot, listPluginInventoryForSite, type Database, type SnapshotRow } from "@syntaxwp/db";

// Captures a pre-action micro-snapshot (§14.1's `snapshots` table) — the
// "before" state a dead man's switch fire or failed verification reverts
// back to (A4.3).
//
// `active_plugins` is read from `plugin_inventory`, which every heartbeat
// already keeps fresh (A5a.2b) — not a live round-trip to the site itself.
// A real round trip would need a request/response channel to the plugin
// (WP7 native abilities or a legacy poll-response), and neither exists yet
// (Task A7). `options_checksum`/`file_checksums` are therefore left null
// here: there is no capability yet to read WP options or file contents from
// a site, so persisting a fabricated checksum for either would be worse
// than persisting nothing — a snapshot row that claims to cover data it
// doesn't actually have would be misleading evidence during a revert.
//
// This is still a real, useful revert target on its own: A3's policy engine
// already gates the two actions this can fully snapshot and reverse
// (deactivate_plugin/activate_plugin) as "ask" or "allow", so capturing
// plugin activation state isn't a no-op in the meantime.
export async function captureSnapshot(
  db: Database,
  input: { siteId: string; workOrderId: string },
): Promise<SnapshotRow> {
  const inventory = await listPluginInventoryForSite(db, input.siteId);
  const activePlugins = inventory.map((entry) => ({
    slug: entry.slug,
    version: entry.version,
    active: entry.active,
  }));

  return createSnapshot(db, {
    siteId: input.siteId,
    workOrderId: input.workOrderId,
    activePlugins,
  });
}
