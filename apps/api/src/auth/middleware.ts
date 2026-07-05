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
