import { createClient } from "@supabase/supabase-js"

// Minimal browser client for Task 1.7 — no login UI built yet, this just
// makes the session capability available for the page that needs it next.
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are not set — see LOCAL-DEVELOPMENT-SETUP.md §3")
  }
  return createClient(url, anonKey)
}
