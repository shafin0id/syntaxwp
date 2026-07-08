import type { Task } from "graphile-worker";
import { db, pruneNoncesOlderThan } from "@syntaxwp/db";

// Rows older than the replay window (5 min, matching verifySiteAuth's
// timestamp check in apps/api/src/auth/site-auth.ts) can never be relevant
// to a future replay check again — nothing reads them past that point.
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export const siteAuthNoncePrune: Task = async () => {
  const cutoff = new Date(Date.now() - REPLAY_WINDOW_MS);
  await pruneNoncesOlderThan(db, cutoff);
};
