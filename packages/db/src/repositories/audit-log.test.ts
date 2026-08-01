import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, sql } from "../client.js";
import { auditLog, orgs, sites } from "../schema/index.js";
import { insertAuditLog, listAuditLogForSite } from "./audit-log.js";

// Integration test — needs a live local Postgres (`supabase start`, see
// LOCAL-DEVELOPMENT-SETUP.md §4). Not yet wired into CI (that's Task A8.2's
// job: add a Postgres service container to .github/workflows/ci.yml).
//
// This exercises the actual guarantee from migration
// 0001_audit_log_append_only.sql: the trigger, not just app-level discipline
// (insertAuditLog/listAuditLogForSite deliberately have no update/delete
// counterparts, but that alone wouldn't stop a raw SQL UPDATE/DELETE issued
// by other code, or a future dev who bypasses the repository layer).
describe("audit_log append-only enforcement", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("allows INSERT", async () => {
    const [org] = await db.insert(orgs).values({ name: "audit-log-test-org" }).returning();
    const [site] = await db
      .insert(sites)
      .values({ orgId: org.id, url: "http://example.test", siteSecretCiphertext: "test-secret" })
      .returning();

    const entry = await insertAuditLog(db, {
      siteId: site.id,
      eventType: "test_event",
      actor: "system",
      summary: "test entry",
    });

    expect(entry.id).toBeDefined();
    const rows = await listAuditLogForSite(db, site.id);
    expect(rows.map((r) => r.id)).toContain(entry.id);
  });

  it("rejects UPDATE via raw SQL, even as the connected (superuser) role", async () => {
    const [row] = await db
      .insert(auditLog)
      .values({ siteId: randomUUID(), eventType: "test_event", actor: "system", summary: "x" })
      .returning();

    await expect(
      sql`UPDATE audit_log SET summary = 'tampered' WHERE id = ${row.id}`,
    ).rejects.toThrow(/append-only/i);
  });

  it("rejects DELETE via raw SQL, even as the connected (superuser) role", async () => {
    const [row] = await db
      .insert(auditLog)
      .values({ siteId: randomUUID(), eventType: "test_event", actor: "system", summary: "x" })
      .returning();

    await expect(sql`DELETE FROM audit_log WHERE id = ${row.id}`).rejects.toThrow(/append-only/i);
  });

  it("rejects UPDATE via the Drizzle ORM query builder", async () => {
    const [row] = await db
      .insert(auditLog)
      .values({ siteId: randomUUID(), eventType: "test_event", actor: "system", summary: "x" })
      .returning();

    await expect(
      db.update(auditLog).set({ summary: "tampered" }).where(eq(auditLog.id, row.id)),
    ).rejects.toThrow(/append-only/i);
  });

  it("rejects DELETE via the Drizzle ORM query builder", async () => {
    const [row] = await db
      .insert(auditLog)
      .values({ siteId: randomUUID(), eventType: "test_event", actor: "system", summary: "x" })
      .returning();

    await expect(db.delete(auditLog).where(eq(auditLog.id, row.id))).rejects.toThrow(
      /append-only/i,
    );
  });
});
