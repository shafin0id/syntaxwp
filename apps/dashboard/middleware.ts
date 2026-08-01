import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const REMEMBER_COOKIE = "sw_remember"

// UX-only redirect for page navigation — the real security boundary is
// apps/api's requireSession middleware (a different origin/process this
// middleware has no authority over). Without this, an unauthenticated
// visitor would still see the dashboard shell render with every data
// fetch failing quietly instead of landing on a login screen.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return response
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // sw_remember is a plain cookie set at login, not a Supabase one: a
  // session cookie (gone when the browser closes) if "remember me" was
  // unchecked, a ~30-day cookie if checked. Supabase's own session cookie
  // persists ~400 days regardless, so a session that outlived its
  // sw_remember cookie is signed out here instead of staying silently valid.
  let authenticated = Boolean(user)
  if (user && !request.cookies.get(REMEMBER_COOKIE)) {
    authenticated = false
    await supabase.auth.signOut()
  }

  const redirectTo = (pathname: string) => {
    const target = request.nextUrl.clone()
    target.pathname = pathname
    const redirectResponse = NextResponse.redirect(target)
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
    return redirectResponse
  }

  if (!authenticated && !request.nextUrl.pathname.startsWith("/login")) {
    return redirectTo("/login")
  }

  if (authenticated && request.nextUrl.pathname.startsWith("/login")) {
    return redirectTo("/")
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
