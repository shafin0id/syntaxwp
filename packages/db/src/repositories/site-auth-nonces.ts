import { lt } from "drizzle-orm";
import type { Database } from "../client.js";
import { siteAuthNonces } from "../schema/index.js";

// Returns false if (siteId, nonce) was already recorded — the caller's
// signal to reject the request as a replay. Relies on the composite primary
// key to make this atomic: a concurrent duplicate insert fails at the DB
// constraint level rather than racing a read-then-write check.
export async function recordNonceIfUnused(
  db: Database,
  siteId: string,
  nonce: string,
): Promise<boolean> {
  try {
    await db.insert(siteAuthNonces).values({ siteId, nonce });
    return true;
  } catch (err) {
    // Postgres 23505 = unique_violation — the composite PK already has this
    // (siteId, nonce) pair, i.e. an actual replay. Any other error (DB
    // unreachable, etc.) is a real failure and should propagate, not be
    // reported to the caller as "this looks like a replay."
    if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      return false;
    }
    throw err;
  }
}

// Called by the site_auth_nonce_prune Graphile Worker job (A5a.1) — rows
// older than the replay window (5 min, matching the timestamp check in
// verifySiteAuth) serve no further purpose.
export async function pruneNoncesOlderThan(db: Database, olderThan: Date): Promise<void> {
  await db.delete(siteAuthNonces).where(lt(siteAuthNonces.createdAt, olderThan));
}
