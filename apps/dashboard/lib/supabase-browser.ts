import { createBrowserClient } from "@supabase/ssr"

// createBrowserClient (not the bare @supabase/supabase-js client) so the
// session lands in cookies, not just localStorage — middleware.ts reads
// those same cookies server-side to decide whether a request is authed.
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are not set — see LOCAL-DEVELOPMENT-SETUP.md §3")
  }
  return createBrowserClient(url, anonKey)
}
