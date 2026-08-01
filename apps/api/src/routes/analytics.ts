import { Hono } from "hono";
import { db } from "@syntaxwp/db";
import { sites } from "@syntaxwp/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const PageviewSchema = z.object({
  site_id: z.string().uuid(),
  path: z.string(),
  referrer: z.string().optional(),
});

export const analyticsRoute = new Hono()
  .post("/api/pageview", async (c) => {
    try {
      const body = await c.req.json();
      const parsed = PageviewSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "Invalid payload" }, 400);
      }

      const { site_id, path, referrer } = parsed.data;

      // Verify the site exists in our database
      const [site] = await db
        .select()
        .from(sites)
        .where(eq(sites.id, site_id))
        .limit(1);

      if (!site) {
        return c.json({ error: "Site not found" }, 404);
      }

      // Aggregate/log pageview metadata securely (GDPR clean)
      console.log(`[pageview] Site ID: ${site_id} | Path: ${path} | Referrer: ${referrer || "none"}`);

      return c.json({ status: "ok" }, 200);
    } catch (err: any) {
      console.error("Failed to track pageview:", err.message);
      return c.json({ error: "Internal server error" }, 500);
    }
  });
