import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { orgs } from "../schema/index.js";

export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;

// orgs is the tenant root — there's no wider scope to isolate by, unlike every
// other repository in this directory (§14.2).
export async function createOrg(db: Database, input: NewOrg): Promise<Org> {
  const [org] = await db.insert(orgs).values(input).returning();
  return org;
}

export async function getOrgById(db: Database, orgId: string): Promise<Org | undefined> {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  return org;
}
