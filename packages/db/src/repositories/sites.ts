import { and, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { sites } from "../schema/index.js";

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;

// Scoped by org_id (§14.2) — a dashboard-authenticated caller may only ever
// create/list/read sites under their own org.
export async function createSite(db: Database, input: NewSite): Promise<Site> {
  const [site] = await db.insert(sites).values(input).returning();
  return site;
}

export async function listSitesForOrg(db: Database, orgId: string): Promise<Site[]> {
  return db.select().from(sites).where(eq(sites.orgId, orgId));
}

export async function getSiteByIdForOrg(
  db: Database,
  siteId: string,
  orgId: string,
): Promise<Site | undefined> {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId)));
  return site;
}

// Deliberately NOT org-scoped: site-HMAC-authenticated requests (heartbeat,
// events) identify themselves by site_id alone — the org isn't known until
// this lookup resolves it, so it can't be a query parameter here. Every
// caller of this function must be doing HMAC/credential resolution, not
// serving a dashboard read (use getSiteByIdForOrg for that).
export async function getSiteById(db: Database, siteId: string): Promise<Site | undefined> {
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
  return site;
}

export async function recordHeartbeat(
  db: Database,
  siteId: string,
  fields: { healthScore?: number; wpVersion?: string; executionPath?: string; availableWpVersion?: string | null; themes?: any[]; title?: string },
): Promise<void> {
  await db
    .update(sites)
    .set({ lastHeartbeatAt: new Date(), ...fields })
    .where(eq(sites.id, siteId));
}
