import type { MiddlewareHandler } from "hono";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase.js";

export type SessionVariables = { user: User };

// Minimal session check for the foundation task: verifies a Supabase Auth
// access token passed as `Authorization: Bearer <token>`. Role/permission
// enforcement beyond "is this a valid session" is out of scope here.
export const requireSession: MiddlewareHandler<{ Variables: SessionVariables }> = async (
  c,
  next,
) => {
  const authHeader = c.req.header("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return c.json({ error: "missing session token" }, 401);
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return c.json({ error: "invalid session" }, 401);
  }

  c.set("user", data.user);
  await next();
};

// There's no org-membership table yet (§14.1 doesn't define one, and adding
// a full invite/multi-user-per-org system is out of scope for Track A) — a
// user's org is looked up from `app_metadata.org_id`, a Supabase Auth field
// only settable by service-role calls (never by the user themselves, unlike
// `user_metadata`), which is Supabase's own recommended place for
// server-controlled claims like this. Flagged as an interim decision, easy
// to swap for a real org_members table later without changing callers of
// this function — see auth/seed-dev-user.ts for how the dev user gets one.
export function getOrgIdFromUser(user: User): string | undefined {
  const orgId = user.app_metadata?.org_id;
  return typeof orgId === "string" ? orgId : undefined;
}
