"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, Loader2 } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase-browser"
import { Card } from "@/components/ui/card"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(signInError.message)
        return
      }
      // Supabase's own session cookie always persists ~400 days — this
      // separate cookie is what middleware.ts actually checks. No max-age
      // makes it a session cookie (gone when the browser closes); a 30-day
      // max-age is the "remember me" window.
      const maxAge = remember ? 30 * 24 * 60 * 60 : undefined
      const secure = location.protocol === "https:" ? "; secure" : ""
      document.cookie = `sw_remember=1; path=/${maxAge ? `; max-age=${maxAge}` : ""}${secure}; samesite=lax`
      router.push("/")
      router.refresh()
    } catch (err) {
      console.error("Login failed:", err)
      setError("Couldn't reach the login service — please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6">
        <div className="flex flex-col items-center gap-2 mb-6">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </span>
          <h1 className="text-lg font-semibold text-foreground">SyntaxWP</h1>
          <p className="text-xs text-muted-foreground text-center text-pretty">
            Sign in to manage your site's monitoring and safety controls.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-3.5 rounded border-border accent-primary cursor-pointer"
            />
            Remember me for 30 days
          </label>

          {error && <p className="text-xs font-semibold text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </Card>
    </div>
  )
}
