import { API_BASE_URL } from "./config"
import { createSupabaseBrowserClient } from "./supabase-browser"

const supabase = createSupabaseBrowserClient()

// Every dashboard.ts route requires a session now — this attaches the
// current Supabase access token the same way for every call site instead
// of each page hand-rolling its own Authorization header.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const headers = new Headers(init.headers)
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`)
  }

  return fetch(`${API_BASE_URL}${path}`, { ...init, headers })
}

// EventSource can't set custom headers, so the SSE stream can't authenticate
// via apiFetch — this exposes the same token for callers using
// @microsoft/fetch-event-source instead (see lib/stream-context.tsx).
export async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}
