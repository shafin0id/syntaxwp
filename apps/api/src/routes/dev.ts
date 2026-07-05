import { Hono } from "hono";
import { requireSession, type SessionVariables } from "../auth/middleware.js";

// Throwaway routes for Task 1's definition-of-done check only:
// - /site-health proves the dashboard<->api wire is live (§ Task 1 DoD).
// - /whoami proves the session middleware from Task 1.7 works.
// Both are replaced by real implementations in Task B10/B11.
export const devRoutes = new Hono<{ Variables: SessionVariables }>()
  .get("/site-health", (c) => c.json({ siteId: "dev-site", healthScore: 87 }))
  .get("/whoami", requireSession, (c) => c.json({ user: c.get("user") }));
