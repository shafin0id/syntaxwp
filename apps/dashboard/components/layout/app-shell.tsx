/**
 * AppShell Component
 * 
 * Provides the global layout frame of the admin dashboard, including responsive
 * sidebars (Sidebar, StatusRail), global search bar, user menu, alert notifications panel,
 * and page frame wrapping.
 */

"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Menu, Bell, Search, ChevronDown, Check, LogOut, User, Sparkles, AlertCircle } from "lucide-react"
import { Sidebar } from "./sidebar"
import { StatusRail } from "./status-rail"
import { StatusDot } from "@/components/ui/status"
import { cn } from "@/lib/utils"

export function AppShell({
  title,
  subtitle,
  actions,
  showRail = true,
  children,
}: {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  showRail?: boolean
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchFocused, setSearchFocused] = useState(false)
  const router = useRouter()

  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchFocused(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Dynamic fake search results
  const searchResults = [
    { label: "View active incident", href: "/incidents", match: "incident error conflict checkout" },
    { label: "Update WP Rocket / WooCommerce", href: "/security", match: "plugin update security patch yoast" },
    { label: "Configure automated permission settings", href: "/settings", match: "permission auto settings config auto-apply" },
    { label: "Check Core Web Vitals performance", href: "/performance", match: "speed performance lcp inp load weight ttfb" },
    { label: "Run Stripe Checkout Test", href: "/store", match: "store protection paypal payment stripe apple" },
    { label: "Revert to Daily Safety Snapshot", href: "/restore-points", match: "restore point backup snapshot history" },
  ].filter((item) =>
    searchQuery === ""
      ? false
      : item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.match.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden w-sidebar-width shrink-0 border-r border-border lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-foreground/45 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute left-0 top-0 h-full w-drawer-width border-r border-border bg-sidebar shadow-xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-4.5" />
          </button>

          <SiteSwitcher />

          <div className="ml-auto flex items-center gap-2">
            {/* Search Input Box */}
            <div ref={searchRef} className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search anything (e.g. speed, security)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                className="h-9 w-64 rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 focus:w-80"
              />

              {/* Search Results Popover */}
              {searchFocused && searchQuery !== "" && (
                <div className="absolute right-0 top-full z-20 mt-1.5 w-80 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
                  <p className="px-2.5 py-1.5 text-xs-compact font-semibold uppercase tracking-wide text-muted-foreground">
                    Search Results
                  </p>
                  {searchResults.length === 0 ? (
                    <p className="px-2.5 py-3 text-xs text-muted-foreground">
                      No matching page or action found. Try "speed", "restore" or "update".
                    </p>
                  ) : (
                    searchResults.map((res) => (
                      <button
                        key={res.href}
                        onClick={() => {
                          setSearchFocused(false)
                          setSearchQuery("")
                          router.push(res.href)
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Sparkles className="size-3.5 text-primary shrink-0" />
                        <span className="truncate">{res.label}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>



            {/* Notifications Button */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen((v) => !v)}
                className="relative flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="size-4.5" />
                <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-warning ring-2 ring-background" />
              </button>

              {/* Notifications Popover */}
              {notificationsOpen && (
                <>
                  <button className="fixed inset-0 z-10" onClick={() => setNotificationsOpen(false)} aria-label="Close" />
                  <div className="absolute right-0 top-full z-20 mt-1.5 w-80 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
                    <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5 mb-1">
                      <p className="text-xs-compact font-semibold uppercase tracking-wide text-muted-foreground">
                        Alerts & Updates
                      </p>
                      <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-2xs font-semibold text-warning-foreground">
                        1 Action Required
                      </span>
                    </div>
                    <div className="divide-y divide-border/60 max-h-280px overflow-y-auto">
                      <Link
                        href="/incidents"
                        onClick={() => setNotificationsOpen(false)}
                        className="flex items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-xs hover:bg-muted transition-colors"
                      >
                        <AlertCircle className="size-4 text-warning shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-foreground">Checkout Button Conflict</p>
                          <p className="text-muted-foreground mt-0.5">Stripe Payments Pro + WooCommerce 9.1 requires approval.</p>
                          <p className="text-2xs text-muted-foreground mt-1">3 minutes ago</p>
                        </div>
                      </Link>
                      <Link
                        href="/security"
                        onClick={() => setNotificationsOpen(false)}
                        className="flex items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-xs hover:bg-muted transition-colors"
                      >
                        <StatusDot status="warning" />
                        <div>
                          <p className="font-semibold text-foreground">Updates Ready</p>
                          <p className="text-muted-foreground mt-0.5">WP Rocket update resolves a cache poisoning advisory.</p>
                          <p className="text-2xs text-muted-foreground mt-1">6 hours ago</p>
                        </div>
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-border bg-card p-1 pr-2 hover:bg-muted cursor-pointer"
              >
                <img 
                  src="/dp.png" 
                  alt="Shafin Ahmad" 
                  className="size-7 rounded-md object-cover border border-border/50 shadow-xs"
                />
                <span className="text-xs font-semibold text-foreground select-none ml-0.5">Shafin</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>

              {/* User Dropdown Popover */}
              {profileOpen && (
                <>
                  <button className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} aria-label="Close" />
                  <div className="absolute right-0 top-full z-20 mt-1.5 w-56 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
                    <div className="px-2.5 py-2 border-b border-border/80 mb-1">
                      <p className="text-xs font-semibold text-foreground">Shafin Ahmad</p>
                      <p className="text-2xs text-muted-foreground truncate">shafin@greenleafbotanicals.com</p>
                    </div>
                    <button
                      onClick={() => {
                        setProfileOpen(false)
                        router.push("/settings")
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted transition-colors cursor-pointer"
                    >
                      <User className="size-4 text-muted-foreground" />
                      <span>Account Settings</span>
                    </button>
                    <button
                      onClick={() => {
                        setProfileOpen(false)
                        alert("Mock Logout triggered")
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted text-danger hover:text-danger transition-colors cursor-pointer"
                    >
                      <LogOut className="size-4 text-danger" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Content + rail */}
        <div className="flex min-w-0 flex-1">
          <main className="min-w-0 flex-1">
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
              {/* Page heading */}
              {title ? (
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-4xl-compact">
                      {title}
                    </h1>
                    {subtitle ? (
                      <p className="mt-1 text-sm text-muted-foreground text-pretty">{subtitle}</p>
                    ) : null}
                  </div>
                  {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
                </div>
              ) : null}
              {children}
            </div>
          </main>
          {showRail ? <StatusRail /> : null}
        </div>
      </div>
    </div>
  )
}

function SiteSwitcher() {
  const [open, setOpen] = useState(false)
  const [sitesList, setSitesList] = useState<any[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)

  useEffect(() => {
    // Read from localStorage initially
    const stored = typeof window !== "undefined" ? localStorage.getItem("selectedSiteId") : null;
    setSelectedSiteId(stored);

    fetch("http://localhost:4000/api/sites")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSitesList(data);
          
          // If stored siteId is not valid or doesn't exist, default to first site
          const hasStored = stored && data.some((s: any) => s.id === stored);
          if (!hasStored && data.length > 0) {
            const defaultId = data[0].id;
            setSelectedSiteId(defaultId);
            localStorage.setItem("selectedSiteId", defaultId);
            window.dispatchEvent(new Event("siteChanged"));
          }
        }
      })
      .catch(console.error);

    const handleExternalChange = () => {
      const stored = typeof window !== "undefined" ? localStorage.getItem("selectedSiteId") : null;
      setSelectedSiteId(stored);
    };
    window.addEventListener("siteChanged", handleExternalChange);
    return () => window.removeEventListener("siteChanged", handleExternalChange);
  }, []);

  const getHostname = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  const selectedSite = sitesList.find((s) => s.id === selectedSiteId) || sitesList[0];
  const displayName = selectedSite ? (selectedSite.title || getHostname(selectedSite.url)) : "Select Website";

  const handleSelectSite = (id: string) => {
    setSelectedSiteId(id);
    localStorage.setItem("selectedSiteId", id);
    window.dispatchEvent(new Event("siteChanged"));
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-lg border border-border bg-card py-1.5 pl-2.5 pr-2 hover:bg-muted cursor-pointer"
      >
        <StatusDot status={selectedSite?.healthScore < 80 ? "warning" : "healthy"} pulse />
        <span className="max-w-40 truncate text-sm font-medium">{displayName}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
      {open ? (
        <>
          <button className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-label="Close" />
          <div className="absolute left-0 top-full z-20 mt-1.5 w-64 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
            <p className="px-2.5 py-1.5 text-xs-compact font-semibold uppercase tracking-wide text-muted-foreground">
              Your websites
            </p>
            {sitesList.map((s) => {
              const isSelected = s.id === selectedSiteId || (!selectedSiteId && s.id === sitesList[0]?.id);
              return (
                <button
                  key={s.id}
                  onClick={() => handleSelectSite(s.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted cursor-pointer"
                >
                  <StatusDot status={s.healthScore < 80 ? "warning" : "healthy"} />
                  <span className="flex-1 truncate">{s.title || getHostname(s.url)}</span>
                  {isSelected ? <Check className="size-4 text-primary" /> : null}
                </button>
              );
            })}
            <button
              onClick={() => {
                setOpen(false)
                alert("Site creation is simulated in Settings.")
              }}
              className="mt-1 w-full rounded-lg border border-dashed border-border px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted cursor-pointer"
            >
              + Add a website
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
