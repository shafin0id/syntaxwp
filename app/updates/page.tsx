"use client"

import { useState, useEffect } from "react"
import {
  ArrowUpCircle,
  Loader2,
  Check,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
  Globe,
  Terminal,
  Server,
  Lock,
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { site as initialSite } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

export default function UpdatesPage() {
  const [site, setSite] = useState(initialSite)
  const [isChecking, setIsChecking] = useState(false)
  const [activeFilter, setActiveFilter] = useState("all") // "all" | "active" | "inactive"
  
  // WordPress Core Update State
  const [wpVersion, setWpVersion] = useState(site.wpVersion)
  const [isUpdatingCore, setIsUpdatingCore] = useState(false)
  const [coreUpdated, setCoreUpdated] = useState(false)

  // Automated Safe-Update Stepper State
  const [safeStep, setSafeStep] = useState(3) // Start at step 3 (testing regression)
  const [safeStatus, setSafeStatus] = useState<"running" | "completed">("running")
  const [subStep, setSubStep] = useState(0)

  // Plugins state (only those with updates)
  const [plugins, setPlugins] = useState([
    { name: "WooCommerce", slug: "woocommerce", current: "9.1.0", latest: "9.1.2", status: "active", vulnerability: null, checked: true },
    { name: "LiteSpeed Cache", slug: "litespeed-cache", current: "6.1.0", latest: "6.2.0.1", status: "active", vulnerability: null, checked: true },
    { name: "Yoast SEO", slug: "yoast-seo", current: "22.8", latest: "23.0", status: "active", vulnerability: null, checked: true },
    { name: "Contact Form 7", slug: "contact-form-7", current: "5.9", latest: "5.9.3", status: "active", vulnerability: "High", checked: true },
    { name: "Elementor Website Builder", slug: "elementor", current: "3.21.0", latest: "3.22.1", status: "active", vulnerability: null, checked: true },
    { name: "Wordfence Security", slug: "wordfence", current: "7.11.5", latest: "7.11.7", status: "active", vulnerability: "Medium", checked: true },
    { name: "Akismet Anti-Spam", slug: "akismet", current: "5.3", latest: "5.3.2", status: "inactive", vulnerability: null, checked: false },
    { name: "WP Mail SMTP", slug: "wp-mail-smtp", current: "4.0.1", latest: "4.1.0", status: "active", vulnerability: null, checked: true },
    { name: "Advanced Custom Fields", slug: "advanced-custom-fields", current: "6.2.7", latest: "6.3.0", status: "inactive", vulnerability: null, checked: false },
    { name: "Jetpack", slug: "jetpack", current: "13.4", latest: "13.5", status: "inactive", vulnerability: null, checked: false },
  ])
  const [isUpdatingPlugins, setIsUpdatingPlugins] = useState(false)

  // Themes state (only those with updates)
  const [themes, setThemes] = useState([
    { name: "Twenty Twenty-Seven", slug: "twenty-twenty-seven", current: "1.0", latest: "1.2", status: "active", description: "Default WordPress theme. Visual style block updates & header optimization.", checked: true },
    { name: "Twenty Twenty-Six", slug: "twenty-twenty-six", current: "1.1", latest: "1.3", status: "inactive", description: "Default WordPress theme. Performance enhancement for standard containers.", checked: false },
    { name: "Twenty Twenty-Five", slug: "twenty-twenty-five", current: "1.2", latest: "1.4", status: "inactive", description: "Default WordPress theme. Accessibility improvements and RTL support fixes.", checked: false },
  ])
  const [isUpdatingThemes, setIsUpdatingThemes] = useState(false)

  // Simulate progress of safe-update stepper
  useEffect(() => {
    if (safeStatus === "completed") return

    // Progress safeStep sequentially based on snapshot & troubleshooting mode phases
    const t1 = setTimeout(() => setSafeStep(1), 2200) // Isolate Session
    const t2 = setTimeout(() => setSafeStep(2), 4400) // Apply Test Update
    const t3 = setTimeout(() => {
      setSafeStep(3) // Playwright Verification
      setSubStep(0)
    }, 6600)

    const ts1 = setTimeout(() => setSubStep(1), 8000)
    const ts2 = setTimeout(() => setSubStep(2), 9400)
    const ts3 = setTimeout(() => setSubStep(3), 10800)

    const t4 = setTimeout(() => setSafeStep(4), 12200) // Cross-Check & Release
    const t5 = setTimeout(() => {
      setSafeStep(5) // Complete
      setSafeStatus("completed")
    }, 15000)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(ts1)
      clearTimeout(ts2)
      clearTimeout(ts3)
      clearTimeout(t4)
      clearTimeout(t5)
    }
  }, [safeStatus])

  // Check Again Handler
  const handleCheckAgain = () => {
    setIsChecking(true)
    setTimeout(() => {
      setIsChecking(false)
      // If completed, reset safe update stepper for demo
      if (safeStatus === "completed") {
        setSafeStep(0)
        setSubStep(0)
        setSafeStatus("running")
      }
    }, 1500)
  }

  // WordPress Core Update Handler
  const handleUpdateCore = () => {
    setIsUpdatingCore(true)
    setTimeout(() => {
      setIsUpdatingCore(false)
      setCoreUpdated(true)
      setWpVersion("7.1.0")
      setSite(prev => ({ ...prev, wpVersion: "7.1.0" }))
    }, 2500)
  }

  // Plugins Update Handler
  const handleUpdatePlugins = () => {
    setIsUpdatingPlugins(true)
    setTimeout(() => {
      setIsUpdatingPlugins(false)
      setPlugins(prev => prev.filter(p => !p.checked))
    }, 2500)
  }

  // Themes Update Handler
  const handleUpdateThemes = () => {
    setIsUpdatingThemes(true)
    setTimeout(() => {
      setIsUpdatingThemes(false)
      setThemes(prev => prev.filter(t => !t.checked))
    }, 2500)
  }

  // Filtered plugins and themes based on tab selection
  const filteredPlugins = plugins.filter((p) => {
    if (activeFilter === "all") return true
    return p.status === activeFilter
  })

  const filteredThemes = themes.filter((t) => {
    if (activeFilter === "all") return true
    return t.status === activeFilter
  })

  // Toggle helper for plugin checkboxes
  const togglePlugin = (slug: string) => {
    setPlugins(prev =>
      prev.map(p => (p.slug === slug ? { ...p, checked: !p.checked } : p))
    )
  }

  // Toggle helper for select all plugins
  const allPluginsSelected = filteredPlugins.length > 0 && filteredPlugins.every(p => p.checked)
  const toggleAllPlugins = () => {
    const targetState = !allPluginsSelected
    setPlugins(prev =>
      prev.map(p => {
        if (filteredPlugins.some(fp => fp.slug === p.slug)) {
          return { ...p, checked: targetState }
        }
        return p
      })
    )
  }

  // Toggle helper for theme checkboxes
  const toggleTheme = (slug: string) => {
    setThemes(prev =>
      prev.map(t => (t.slug === slug ? { ...t, checked: !t.checked } : t))
    )
  }

  // Toggle helper for select all themes
  const allThemesSelected = filteredThemes.length > 0 && filteredThemes.every(t => t.checked)
  const toggleAllThemes = () => {
    const targetState = !allThemesSelected
    setThemes(prev =>
      prev.map(t => {
        if (filteredThemes.some(ft => ft.slug === t.slug)) {
          return { ...t, checked: targetState }
        }
        return t
      })
    )
  }

  // Check if any checked for buttons
  const anyPluginChecked = filteredPlugins.some(p => p.checked)
  const anyThemeChecked = filteredThemes.some(t => t.checked)

  const RefreshIcon = ({ className }: { className?: string }) => (
    <RefreshCw className={cn(className, isChecking && "animate-spin")} />
  )

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-8 animate-tab-content">
        <PageHeader
          title="WordPress Updates"
          subtitle="Last checked on July 2, 2026 at 8:25 PM."
          category="CORE & EXTENSIONS"
          icon={RefreshCw}
          actions={
            <Button
              onClick={handleCheckAgain}
              disabled={isChecking}
              variant="primary"
              icon={RefreshIcon}
              className="w-full sm:w-auto min-w-145px justify-between shrink-0"
            >
              {isChecking ? "Checking..." : "Check again"}
            </Button>
          }
          tabs={[
            { id: "all", label: "All updates" },
            { id: "active", label: "Active" },
            { id: "inactive", label: "Inactive" },
          ]}
          activeTab={activeFilter}
          onTabChange={setActiveFilter}
        />

        {/* 1. AUTOMATED SAFE-UPDATES (Agent Stepper Card) */}
        <div className="space-y-3">
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes scanLineAnim {
              0% { top: 0%; opacity: 0.15; }
              50% { opacity: 0.85; }
              100% { top: 100%; opacity: 0.15; }
            }
          `}} />

          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">
              Agent Safe-Updates
            </h2>
            <span className="inline-flex items-center gap-1 text-2xs font-bold bg-primary-soft text-primary border border-primary/10 px-2 py-0.5 rounded-full">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full size-1.5 bg-primary"></span>
              </span>
              Agent Active
            </span>
          </div>

          <Card className="p-6 bg-card rounded-3xl border border-border">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              
              {/* Left Column: Vertical timeline stepper */}
              <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-foreground">
                    {safeStatus === "running" 
                      ? "Agent is verifying updates in troubleshooting session..." 
                      : "Troubleshooting verification complete!"}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    SyntaxWP captures a snapshot of your site settings, runs the update inside a cookie-isolated troubleshooting session (zero impact to live visitors), and deploys globally once checkouts and page layouts are verified.
                  </p>
                </div>

                <div className="relative pl-1.5 space-y-5 before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
                  {[
                    { label: "Pre-Update Snapshot", detail: "Archiving options & plugin checklist to Cloudflare R2", step: 0 },
                    { label: "Isolate Session", detail: "Activating cookie-isolated session (visitors unaffected)", step: 1 },
                    { label: "Apply Test Update", detail: "Upgrading files inside isolated sandbox session", step: 2 },
                    { label: "Playwright Verification", detail: "Synthetic checkout, visual diff & logs sweep in session", step: 3 },
                    { label: "Cross-Check & Release", detail: "Comparing with snapshot. Promotion to live users", step: 4 },
                  ].map((item, idx) => {
                    const isDone = safeStep > item.step
                    const isCurrent = safeStep === item.step
                    const isUpcoming = safeStep < item.step

                    return (
                      <div key={idx} className="relative flex items-start gap-4">
                        <span className={cn(
                          "relative z-10 flex size-8 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-all shadow-sm border",
                          isDone && "bg-success border-success text-white",
                          isCurrent && "bg-primary border-primary text-white ring-4 ring-primary/10",
                          isUpcoming && "border-border text-muted-foreground bg-white"
                        )}>
                          {isDone ? (
                            <Check className="size-4" strokeWidth={3} />
                          ) : isCurrent ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            idx + 1
                          )}
                        </span>
                        
                        <div className="space-y-0.5 pt-0.5">
                          <h4 className={cn(
                            "text-xs font-bold leading-tight transition-colors",
                            isDone && "text-success",
                            isCurrent && "text-primary",
                            isUpcoming && "text-muted-foreground"
                          )}>
                            {item.label}
                          </h4>
                          <p className="text-2xs text-muted-foreground leading-normal">
                            {isCurrent && safeStatus === "running" 
                              ? "Executing pipeline step..." 
                              : isUpcoming 
                                ? "Waiting..." 
                                : item.detail}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Right Column: Sandbox live terminal simulator */}
              <div className="lg:col-span-7 flex flex-col min-h-360px">
                <div className="flex-1 flex flex-col rounded-2xl border border-border bg-accent/15 overflow-hidden shadow-2xs">
                  
                  {/* Mock Browser Header Bar */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-accent/40 border-b border-border/60">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="size-2.5 rounded-full bg-border/80" />
                      <span className="size-2.5 rounded-full bg-border/80" />
                      <span className="size-2.5 rounded-full bg-border/80" />
                    </div>
                    <div className="flex-1 max-w-xs sm:max-w-sm mx-auto flex items-center justify-center gap-1 bg-white border border-border/40 rounded-md py-0.5 px-3 text-2xs text-muted-foreground font-mono select-none">
                      <Lock className="size-2.5 text-success shrink-0" />
                      <span className="text-muted-foreground/60 select-none text-3xs">HTTPS</span>
                      <span className="font-bold text-foreground">
                        {safeStep === 0 && "control-plane.syntaxwp.com/snapshot"}
                        {safeStep === 1 && "greenleafbotanicals.com/?syntaxwp_isolated=1"}
                        {safeStep === 2 && "greenleafbotanicals.com/wp-admin/?syntaxwp_isolated=1"}
                        {safeStep === 3 && "greenleafbotanicals.com/checkout/?syntaxwp_isolated=1"}
                        {safeStep === 4 && "greenleafbotanicals.com/checkout/"}
                        {safeStep === 5 && "greenleafbotanicals.com"}
                      </span>
                    </div>
                    <div className="w-8 shrink-0" />
                  </div>

                  {/* Browser Viewport Simulation */}
                  <div className="flex-1 p-5 flex flex-col justify-between relative overflow-hidden bg-accent/5">
                    {safeStep === 0 ? (
                      // STEP 0: PRE-UPDATE R2 SNAPSHOT
                      <div className="flex-1 flex flex-col justify-center space-y-4 animate-tab-content">
                        <div className="border border-border/40 rounded-xl bg-white p-18px shadow-2xs space-y-3">
                          <div className="flex items-center justify-between border-b border-border/30 pb-2">
                            <span className="text-2xs font-bold text-foreground uppercase tracking-wider font-mono flex items-center gap-1.5">
                              <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
                              Snapshotting Production State
                            </span>
                            <span className="text-4xs text-muted-foreground font-mono bg-accent/40 px-1.5 py-0.5 rounded border border-border/20">Cloudflare R2</span>
                          </div>
                          
                          <div className="space-y-2 text-2xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Active Plugins Baseline:</span>
                              <span className="font-semibold text-foreground font-mono">10 plugins catalogued</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Core Hash Registry:</span>
                              <span className="font-semibold text-foreground font-mono">SHA-256 integrity match</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Database Schema Snapshot:</span>
                              <span className="font-mono text-foreground font-bold">wp_options archived</span>
                            </div>
                          </div>

                          <div className="space-y-1 pt-1">
                            <div className="h-1.5 w-full bg-accent rounded-full overflow-hidden">
                              <div className="h-full bg-primary animate-pulse" style={{ width: '80%' }} />
                            </div>
                            <div className="flex justify-between text-3xs text-muted-foreground font-mono">
                              <span>Saving snapshot_woo_912...</span>
                              <span>80%</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white rounded-xl p-3 border border-border/30 text-2xs text-muted-foreground font-mono space-y-1 shadow-3xs leading-relaxed">
                          <div>[INFO] Capturing current configuration state...</div>
                          <div>[INFO] Uploading baseline options checksum to R2... OK</div>
                        </div>
                      </div>
                    ) : safeStep === 1 ? (
                      // STEP 1: ROUTE ISOLATION TIER
                      <div className="flex-1 flex flex-col justify-center space-y-4 animate-tab-content">
                        <div className="border border-border/40 rounded-xl bg-white p-18px shadow-2xs space-y-3">
                          <div className="flex items-center justify-between border-b border-border/30 pb-2">
                            <span className="text-2xs font-bold text-foreground uppercase tracking-wider font-mono flex items-center gap-1.5">
                              <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
                              Evaluating Security Policy
                            </span>
                            <span className="text-4xs text-primary font-bold bg-primary-soft px-1.5 py-0.5 rounded border border-primary/10 font-mono">Policy Engine</span>
                          </div>

                          <div className="space-y-2 text-2xs">
                            <div className="flex justify-between items-center text-2xs border-b border-border/15 pb-2">
                              <span className="text-muted-foreground">Action Risk Rating:</span>
                              <span className="font-bold text-danger bg-danger-soft px-1.5 py-0.5 rounded border border-danger/10 text-3xs">HIGH RISK (update_plugin)</span>
                            </div>
                            <div className="space-y-1.5 pt-1">
                              <span className="text-muted-foreground block text-3xs font-mono font-bold">TROUBLESHOOTING MODE STRATEGY:</span>
                              <div className="space-y-1.5 font-mono text-3xs">
                                <div className="flex items-center justify-between text-foreground font-semibold">
                                  <span className="flex items-center gap-1">
                                    <Check className="size-3 text-success" />
                                    Pre-Update Snapshot Saved
                                  </span>
                                  <span className="text-success font-mono">R2 Bucket OK</span>
                                </div>
                                <div className="flex items-center justify-between text-foreground font-semibold">
                                  <span className="flex items-center gap-1">
                                    <Check className="size-3 text-success" />
                                    Troubleshooting Session isolated
                                  </span>
                                  <span className="text-success font-mono">Cookie-Isolated</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white rounded-xl p-3 border border-border/30 text-2xs text-muted-foreground font-mono space-y-1 shadow-3xs">
                          <div>[INFO] Active visitors: 42 (serving WooCommerce 9.1.0)</div>
                          <div>[INFO] Created isolated testing cookie session for Agent audit</div>
                        </div>
                      </div>
                    ) : safeStep === 2 ? (
                      // STEP 2: APPLY TEST UPDATE
                      <div className="flex-1 flex flex-col justify-center space-y-4 animate-tab-content">
                        <div className="border border-border/40 rounded-xl bg-white p-4 shadow-2xs space-y-3">
                          <div className="flex items-center justify-between border-b border-border/30 pb-2">
                            <span className="text-2xs font-bold text-foreground uppercase tracking-wider font-mono flex items-center gap-1.5">
                              <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
                              Applying Test Updates
                            </span>
                            <span className="text-4xs text-primary font-bold bg-primary-soft px-1.5 py-0.5 rounded border border-primary/10 font-mono">HMAC WORK ORDER</span>
                          </div>

                          <div className="space-y-2 text-2xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground font-mono">Work Order UUID:</span>
                              <span className="font-semibold text-foreground font-mono text-3xs truncate max-w-150px">ord_e3b0c442...</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Testing Scope:</span>
                              <span className="font-semibold text-foreground font-mono text-3xs">isolated-session-only</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Session Action:</span>
                              <span className="font-bold text-primary animate-pulse text-2xs">Upgrading WooCommerce to 9.1.2...</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white rounded-xl p-3 border border-border/30 text-2xs text-muted-foreground font-mono space-y-1 shadow-3xs leading-relaxed">
                          <div>[SESSION] Live visitors still served WooCommerce 9.1.0 (unaffected)</div>
                          <div>[SESSION] Exposing updated capabilities to isolated session...</div>
                        </div>
                      </div>
                    ) : safeStep === 3 ? (
                      // STEP 3: PLAYWRIGHT VERIFICATION (Show checkout mockup + checklist)
                      <div className="flex-1 flex flex-col justify-between space-y-4 animate-tab-content">
                        
                        {/* Interactive Checkout Page Mockup */}
                        <div className="relative border border-border/40 rounded-xl bg-white p-4 shadow-sm overflow-hidden flex-1 flex flex-col justify-center min-h-140px">
                          
                          {/* Laser Scanning overlay line */}
                          {safeStatus === "running" && (
                            <div 
                              className="absolute inset-x-0 h-0.5 bg-primary/70 shadow-glow pointer-events-none z-10" 
                              style={{ animation: "scanLineAnim 2.5s ease-in-out infinite" }}
                            />
                          )}

                          <div className="space-y-3 relative">
                            <div className="flex items-center justify-between border-b border-border/30 pb-2">
                              <span className="text-2xs font-bold text-foreground uppercase tracking-wider font-mono flex items-center gap-1">
                                <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                                WooCommerce Checkout Test
                              </span>
                              <span className="text-4xs text-primary font-bold bg-primary-soft px-1.5 py-0.5 rounded border border-primary/10 font-mono">Playwright Session</span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-3xs">
                              <div className="space-y-1">
                                <span className="text-muted-foreground block font-mono">Customer Data</span>
                                <div className="h-5 bg-accent/20 rounded border border-border/15 flex items-center px-2 text-foreground font-mono text-4xs truncate">
                                  shafin@buyer-test.com
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-muted-foreground block font-mono">Payment Gateway</span>
                                <div className="h-5 bg-accent/20 rounded border border-border/15 flex items-center px-2 text-foreground font-mono text-4xs justify-between">
                                  <span>•••• 4242 (Stripe)</span>
                                  <span className="text-success text-4xs font-bold">OK</span>
                                </div>
                              </div>
                            </div>

                            <div className="border border-border/35 rounded-lg p-2 bg-accent/10 flex items-center justify-between text-3xs">
                              <span className="font-semibold text-foreground">Subtotal + Taxes:</span>
                              <span className="font-bold text-foreground font-mono">$187.50</span>
                            </div>

                            {/* Clicking trigger simulator */}
                            <div className="flex justify-center pt-1 relative">
                              <button className={cn(
                                "w-full h-8 rounded-lg text-2xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs border border-transparent",
                                subStep === 0 
                                  ? "bg-primary text-white" 
                                  : "bg-success text-white"
                              )}>
                                {subStep === 0 ? (
                                  <>
                                    <Loader2 className="size-3 animate-spin" />
                                    Submitting Synthetic Order...
                                  </>
                                ) : (
                                  <>
                                    <Check className="size-3" strokeWidth={3} />
                                    Order #2048 Placed Successfully
                                  </>
                                )}
                              </button>

                              {/* Pointer animation */}
                              {subStep === 0 && (
                                <div className="absolute right-12 -bottom-1 animate-bounce text-primary shrink-0 pointer-events-none" style={{ transform: "rotate(-25deg)" }}>
                                  <svg viewBox="0 0 24 24" fill="currentColor" stroke="white" strokeWidth="2" className="size-4">
                                    <path d="M4 3l16 11-8.5 1.5L20 22l-3 1.5-8-6.5-5 3.5V3z" />
                                  </svg>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Audit verification item grid */}
                        <div className="bg-white rounded-xl p-3.5 border border-border/40 text-xs-compact space-y-2.5 shadow-2xs">
                          <div className="font-bold text-foreground text-xs border-b border-border/40 pb-1.5 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Terminal className="size-3 text-muted-foreground" />
                              Safety Verification Diagnostics
                            </span>
                            <span className="text-3xs font-bold text-primary bg-primary-soft border border-primary/10 px-2 py-0.5 rounded-full font-mono">
                              Testing phase ({subStep + 1}/4)
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-2xs">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {subStep >= 1 ? (
                                  <Check className="size-3.5 text-success shrink-0" strokeWidth={2.5} />
                                ) : (
                                  <Loader2 className="size-3.5 text-primary animate-spin shrink-0" />
                                )}
                                <span className={cn(
                                  "font-medium",
                                  subStep >= 1 ? "text-foreground" : "text-muted-foreground"
                                )}>
                                  Checkout Gateway Tested
                                </span>
                              </div>
                              <span className="text-3xs font-mono text-muted-foreground">Stripe, PayPal</span>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {subStep >= 2 ? (
                                  <Check className="size-3.5 text-success shrink-0" strokeWidth={2.5} />
                                ) : subStep === 1 ? (
                                  <Loader2 className="size-3.5 text-primary animate-spin shrink-0" />
                                ) : (
                                  <span className="size-3.5 border border-border/60 bg-white rounded-full shrink-0" />
                                )}
                                <span className={cn(
                                  "font-medium",
                                  subStep >= 2 ? "text-foreground" : "text-muted-foreground"
                                )}>
                                  Isolated Layout Audit
                                </span>
                              </div>
                              <span className="text-3xs font-mono text-muted-foreground">99.8% matched</span>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {subStep >= 3 ? (
                                  <Check className="size-3.5 text-success shrink-0" strokeWidth={2.5} />
                                ) : subStep === 2 ? (
                                  <Loader2 className="size-3.5 text-primary animate-spin shrink-0" />
                                ) : (
                                  <span className="size-3.5 border border-border/60 bg-white rounded-full shrink-0" />
                                )}
                                <span className={cn(
                                  "font-medium",
                                  subStep >= 3 ? "text-foreground" : "text-muted-foreground"
                                )}>
                                  Isolated PHP Logs Check
                                </span>
                              </div>
                              <span className="text-3xs font-mono text-muted-foreground">0 errors logged</span>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {subStep >= 4 ? (
                                  <Check className="size-3.5 text-success shrink-0" strokeWidth={2.5} />
                                ) : subStep === 3 ? (
                                  <Loader2 className="size-3.5 text-primary animate-spin shrink-0" />
                                ) : (
                                  <span className="size-3.5 border border-border/60 bg-white rounded-full shrink-0" />
                                )}
                                <span className={cn(
                                  "font-medium",
                                  subStep >= 4 ? "text-foreground" : "text-muted-foreground"
                                )}>
                                  Session LCP Check
                                </span>
                              </div>
                              <span className="text-3xs font-mono text-muted-foreground">+3.2% faster LCP</span>
                            </div>
                          </div>
                        </div>

                      </div>
                    ) : safeStep === 4 ? (
                      // STEP 4: CROSS-CHECK & RELEASE
                      <div className="flex-1 flex flex-col justify-center space-y-4 animate-tab-content">
                        <div className="border border-border/40 rounded-xl bg-white p-18px shadow-2xs space-y-3">
                          <div className="flex items-center justify-between border-b border-border/30 pb-2">
                            <span className="text-2xs font-bold text-foreground uppercase tracking-wider font-mono flex items-center gap-1.5">
                              <Loader2 className="size-3 animate-spin text-primary shrink-0" />
                              Cross-Checking & Deploying
                            </span>
                            <span className="text-4xs text-success font-bold bg-success-soft px-1.5 py-0.5 rounded border border-success/10 font-mono animate-pulse">CROSS-CHECK PASSED</span>
                          </div>
                          
                          <div className="space-y-2 text-2xs">
                            <div className="flex justify-between items-center text-2xs border-b border-border/15 pb-1.5">
                              <span className="text-muted-foreground">Dead Man's Switch (DMS):</span>
                              <span className="font-mono text-danger font-bold flex items-center gap-1 text-3xs">
                                <span className="size-2 rounded-full bg-danger animate-ping" />
                                ARMED (300s timer)
                              </span>
                            </div>
                            <div className="space-y-1 font-mono text-3xs text-muted-foreground">
                              <div>[INFO] Comparing file headers to pre-update snapshot... OK</div>
                              <div>[INFO] Database options validation checksum... MATCHED</div>
                              <div>[INFO] Promoting verified files to live production...</div>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-border/30 text-2xs text-muted-foreground font-mono space-y-1 shadow-3xs">
                          <div>[SYSTEM] In case of post-deploy crash, automatic R2 rollback fires in 290s.</div>
                        </div>
                      </div>
                    ) : (
                      // STEP 5: COMPLETED AUDIT SEAL
                      <div className="flex-1 flex flex-col justify-center items-center text-center p-4 space-y-4 animate-tab-content">
                        <div className="relative">
                          <div className="absolute inset-0 bg-success-soft rounded-full scale-135 animate-ping opacity-30" />
                          <div className="size-16 rounded-full bg-success text-white flex items-center justify-center shadow-md border-4 border-white relative z-10">
                            <ShieldCheck className="size-9" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-foreground">Safe Updates Deployed Successfully</h4>
                          <p className="text-xs-compact text-muted-foreground max-w-xs leading-relaxed">
                            Troubleshooting session verified zero issues. Core, plugin, and theme updates are now live with <strong>zero downtime</strong>.
                          </p>
                        </div>

                        {/* Staging stats card */}
                        <div className="w-full bg-white rounded-2xl border border-border/40 p-4 space-y-2 text-2xs shadow-2xs">
                          <div className="flex justify-between border-b border-border/40 pb-1.5 font-mono text-3xs text-muted-foreground">
                            <span>Diagnostic Engine</span>
                            <span className="text-success font-bold">STATUS_SECURE_APPLIED</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-left">
                            <div>
                              <span className="text-3xs text-muted-foreground block font-mono">Compatibility Score</span>
                              <span className="font-bold text-success">100% Perfect Match</span>
                            </div>
                            <div>
                              <span className="text-3xs text-muted-foreground block font-mono">Store Downtime</span>
                              <span className="font-bold text-success font-mono">0.0 ms</span>
                            </div>
                            <div>
                              <span className="text-3xs text-muted-foreground block font-mono">Recovery Snapshot</span>
                              <span className="font-bold text-foreground font-mono bg-accent/40 px-1 py-0.2 rounded border border-border/10">Snap-312</span>
                            </div>
                            <div>
                              <span className="text-3xs text-muted-foreground block font-mono">Troubleshooting Session</span>
                              <span className="font-bold text-muted-foreground">Terminated & Closed</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Footer terminal status banner */}
                    <div className="mt-3 border-t border-border/40 pt-2 flex items-center justify-between text-3xs text-muted-foreground font-mono select-none">
                      <span className="flex items-center gap-1">
                        <span className={cn("size-1.5 rounded-full", safeStatus === "running" ? "bg-primary animate-pulse" : "bg-success")} />
                        {safeStatus === "running" ? "SESSION_VERIFY_ACTIVE" : "LIVE_PROTECT_STEADY"}
                      </span>
                      <span>runner_v1.4.1</span>
                    </div>

                  </div>
                </div>
              </div>

            </div>
          </Card>
        </div>

        {/* 2. WORDPRESS CORE */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">WordPress Core</h2>
          
          {!coreUpdated ? (
            <Card className="p-6 bg-card rounded-3xl border border-border space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-foreground">
                    An updated version of WordPress is available for your site.
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                    WordPress 7.1.0 includes critical security hardening patches and native CSS delivery optimizations.
                  </p>
                </div>
                
                <div className="inline-flex items-center gap-1 text-xs-compact font-semibold text-success bg-success-soft px-2.5 py-0.5 rounded-full border border-success/10 shrink-0">
                  <ShieldCheck className="size-3.5" />
                  <span>Tested 100% safe</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-accent/30 rounded-2xl p-18px border border-border/40 text-xs">
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-muted-foreground">Current version:</span>{" "}
                    <span className="font-bold text-foreground font-mono">{wpVersion}</span>
                  </div>
                  <ChevronRight className="size-3 text-muted-foreground/30" />
                  <div>
                    <span className="text-muted-foreground">Available version:</span>{" "}
                    <span className="font-bold text-primary font-mono bg-primary-soft px-1.5 py-0.5 rounded-md border border-primary/10">7.1.0</span>
                  </div>
                </div>
                
                <button
                  onClick={handleUpdateCore}
                  disabled={isUpdatingCore}
                  className="inline-flex items-center justify-center gap-2 h-9 px-4.5 rounded-lg text-xs font-bold bg-primary border border-primary text-primary-foreground hover:bg-primary-hover hover:border-primary-hover active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                >
                  {isUpdatingCore ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Safe Updating Core...
                    </>
                  ) : (
                    "Safe Update"
                  )}
                </button>
              </div>
            </Card>
          ) : (
            <Card className="p-5 bg-card rounded-3xl border border-border">
              <div className="flex items-center gap-2 text-xs text-success font-semibold">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>WordPress Core is up to date (version 7.1.0)</span>
              </div>
            </Card>
          )}
        </div>

        {/* 3. PLUGINS */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">Plugins</h2>
          
          {plugins.length > 0 ? (
            <Card className="bg-card rounded-3xl border border-border overflow-hidden">
              {/* Header Bar */}
              <div className="flex items-center justify-between border-b border-border bg-accent/20 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={allPluginsSelected}
                    onChange={toggleAllPlugins}
                    className="rounded border-border text-primary focus:ring-primary size-4 cursor-pointer"
                    id="select-all-plugins"
                  />
                  <label htmlFor="select-all-plugins" className="text-xs font-bold text-foreground select-none cursor-pointer">
                    Select All Plugins
                  </label>
                </div>
                
                <button
                  onClick={handleUpdatePlugins}
                  disabled={isUpdatingPlugins || !anyPluginChecked}
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-lg text-xs font-bold bg-primary border border-primary text-primary-foreground hover:bg-primary-hover hover:border-primary-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  {isUpdatingPlugins ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      Safe Updating Selected...
                    </>
                  ) : (
                    "Safe Update"
                  )}
                </button>
              </div>

              {/* Plugins List */}
              <div className="divide-y divide-border/60">
                {filteredPlugins.map((plugin) => (
                  <div key={plugin.slug} className="flex items-center gap-4 px-5 py-4 hover:bg-accent/10 transition-colors">
                    <input
                      type="checkbox"
                      checked={plugin.checked}
                      onChange={() => togglePlugin(plugin.slug)}
                      className="rounded border-border text-primary focus:ring-primary size-4 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {plugin.name}
                        </span>
                        <span className={cn(
                          "inline-flex rounded-full text-3xs font-bold uppercase tracking-wider px-1.5 py-0.5 border",
                          plugin.status === "active" 
                            ? "bg-success-soft text-success border-success/10" 
                            : "bg-muted-soft text-muted-foreground border-border"
                        )}>
                          {plugin.status}
                        </span>
                        {plugin.vulnerability && (
                          <span className="inline-flex items-center gap-0.5 text-3xs font-bold bg-danger-soft text-danger border border-danger/10 px-1.5 py-0.5 rounded-md">
                            <AlertTriangle className="size-2.5" />
                            {plugin.vulnerability} Security Alert
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-2.5">
                        <span>Version {plugin.current}</span>
                        <ChevronRight className="size-3 text-muted-foreground/30" />
                        <span className="text-primary font-bold bg-primary-soft px-1.5 py-0.5 rounded border border-primary/10">{plugin.latest}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : plugins.length > 0 ? (
            <Card className="p-5 bg-card rounded-3xl border border-border">
              <div className="text-xs text-muted-foreground font-semibold text-center py-4">
                No {activeFilter} plugins have updates available.
              </div>
            </Card>
          ) : (
            <Card className="p-5 bg-card rounded-3xl border border-border">
              <div className="flex items-center gap-2 text-xs text-success font-semibold">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>All active plugins are up to date.</span>
              </div>
            </Card>
          )}
        </div>

        {/* 4. THEMES */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">Themes</h2>
          
          {filteredThemes.length > 0 ? (
            <Card className="bg-card rounded-3xl border border-border overflow-hidden">
              {/* Header Bar */}
              <div className="flex items-center justify-between border-b border-border bg-accent/20 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={allThemesSelected}
                    onChange={toggleAllThemes}
                    className="rounded border-border text-primary focus:ring-primary size-4 cursor-pointer"
                    id="select-all-themes"
                  />
                  <label htmlFor="select-all-themes" className="text-xs font-bold text-foreground select-none cursor-pointer">
                    Select All Themes
                  </label>
                </div>
                
                <button
                  onClick={handleUpdateThemes}
                  disabled={isUpdatingThemes || !anyThemeChecked}
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-lg text-xs font-bold bg-primary border border-primary text-primary-foreground hover:bg-primary-hover hover:border-primary-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  {isUpdatingThemes ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      Safe Updating Selected...
                    </>
                  ) : (
                    "Safe Update"
                  )}
                </button>
              </div>

              {/* Themes List */}
              <div className="divide-y divide-border/60">
                {filteredThemes.map((theme) => (
                  <div key={theme.slug} className="flex items-center gap-4 px-5 py-4 hover:bg-accent/10 transition-colors">
                    <input
                      type="checkbox"
                      checked={theme.checked}
                      onChange={() => toggleTheme(theme.slug)}
                      className="rounded border-border text-primary focus:ring-primary size-4 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {theme.name}
                          </span>
                          <span className={cn(
                            "inline-flex rounded-full text-3xs font-bold uppercase tracking-wider px-1.5 py-0.5 border",
                            theme.status === "active" 
                              ? "bg-success-soft text-success border-success/10" 
                              : "bg-muted-soft text-muted-foreground border-border"
                          )}>
                            {theme.status === "active" ? "Active Theme" : "Inactive"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground max-w-md">
                          {theme.description}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-2.5 sm:self-center">
                        <span>Version {theme.current}</span>
                        <ChevronRight className="size-3 text-muted-foreground/30" />
                        <span className="text-primary font-bold bg-primary-soft px-1.5 py-0.5 rounded border border-primary/10">{theme.latest}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : themes.length > 0 ? (
            <Card className="p-5 bg-card rounded-3xl border border-border">
              <div className="text-xs text-muted-foreground font-semibold text-center py-4">
                No {activeFilter} themes have updates available.
              </div>
            </Card>
          ) : (
            <Card className="p-5 bg-card rounded-3xl border border-border">
              <div className="flex items-center gap-2 text-xs text-success font-semibold">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>All active themes are up to date.</span>
              </div>
            </Card>
          )}
        </div>

      </div>
    </AppShell>
  )
}
