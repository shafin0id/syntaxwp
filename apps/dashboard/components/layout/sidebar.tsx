/**
 * Sidebar Component
 * 
 * Renders the global vertical navigation menu, displaying current route states
 * and quick contact links. Utilizes layout design tokens.
 */

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ShieldCheck, LifeBuoy, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { navItems } from "./nav-config"
import { Button } from "@/components/ui/button"
import { useStream } from "@/lib/stream-context"

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { incidentsList } = useStream()
  const activeCount = incidentsList.filter((inc) => inc.stage !== "resolved").length

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Brand */}
      <div className="flex items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5" onClick={onNavigate}>
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
            <ShieldCheck className="size-5" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm-compact font-bold tracking-tight text-sidebar-foreground">
              SyntaxWP
            </span>
            <span className="mt-1 text-2xs text-muted-foreground">Website guardian</span>
          </span>
        </Link>
        {onNavigate ? (
          <button
            onClick={onNavigate}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent lg:hidden"
            aria-label="Close menu"
          >
            <X className="size-4.5" />
          </button>
        ) : null}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const Icon = item.icon
          const badge = item.href === "/incidents" ? (activeCount > 0 ? activeCount : null) : item.badge
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-18px shrink-0",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-foreground",
                )}
              />
              <span className="flex-1">{item.label}</span>
              {badge ? (
                <span className="flex size-5 items-center justify-center rounded-full bg-danger text-2xs font-bold text-white">
                  {badge}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      {/* Help card */}
      <div className="p-3">
        <div className="rounded-3xl border border-primary/20 bg-blue-blueprint p-18px shadow-xs text-white">
          <div className="flex items-center gap-2">
            <LifeBuoy className="size-4 text-white" />
            <span className="text-xs font-bold">Need a human?</span>
          </div>
          <p className="mt-1.5 text-2xs leading-relaxed text-white/80">
            Our WordPress experts are one click away, 24/7. No tech jargon, ever.
          </p>
          <Button variant="primary-inverted" className="mt-3 w-full text-2xs h-9">
            Chat with support
          </Button>
        </div>
      </div>
    </div>
  )
}
