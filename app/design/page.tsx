"use client"

import { 
  Sparkles, 
  HelpCircle, 
  ShieldCheck, 
  AlertTriangle, 
  AlertOctagon, 
  Info, 
  Loader2, 
  ArrowRight,
  Laptop,
  Check,
  Grid,
  FileText,
  Bookmark
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Card, CardHeader } from "@/components/ui/card"
import { StatusPill } from "@/components/ui/status"
import { SeverityBadge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"

export default function DesignSystemPage() {
  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          title="Design System & Tokens"
          subtitle="The blueprint-inspired Royal Blue & Warm Sand design system. Crafted for trust, absolute visual clarity, and minimal friction."
          category="DESIGN TOKENS"
          icon={Sparkles}
        />
        
        {/* Core Philosophy Banner */}
        <div className="bg-blue-blueprint rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xs border border-border">
          <div className="space-y-2 max-w-xl">
            <h3 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Sparkles className="size-5 shrink-0" />
              Royal Blue & Bento Grid Aesthetic
            </h3>
            <p className="text-sm text-white/90 leading-relaxed font-medium">
              We leverage an energetic, high-trust electric royal blue combined with structured bento-box layouts, warm sand canvas, and high-visibility blueprint grids. Designed specifically to convey around-the-clock safety and clarity for WooCommerce/WordPress site owners.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white backdrop-blur-xs font-mono">
              radius: 1.1rem
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white backdrop-blur-xs font-mono">
              font: Geist Sans
            </div>
          </div>
        </div>

        {/* Brand Color Swatches */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader title="Core Colors" description="Flat, high-contrast swatches defining the application canvas." icon={Bookmark} />
            <div className="p-5 space-y-4">
              {[
                { name: "Electric Royal Blue (Primary)", variable: "var(--primary)", hex: "#0055ff", desc: "For buttons, active states, and telemetry emphasis." },
                { name: "Warm Sand Gray (Background)", variable: "var(--background)", hex: "#f3f2ec", desc: "Off-white warm sand canvas. Reduces eye strain and feels organic." },
                { name: "Pure White (Cards)", variable: "var(--card)", hex: "#ffffff", desc: "Main content backgrounds. High-contrast containers." },
                { name: "Slate Divider (Border)", variable: "var(--border)", hex: "#e4e3dc", desc: "Crisp, thin grid separators mapping the layout." },
                { name: "Charcoal Black (Foreground)", variable: "var(--foreground)", hex: "#111111", desc: "Used for body text, active menus, and title headers." },
              ].map((swatch) => (
                <div key={swatch.name} className="flex items-center gap-4 rounded-xl border border-border p-3 bg-background/30">
                  <div 
                    className="size-12 rounded-lg border border-border shrink-0" 
                    style={{ background: swatch.variable }} 
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-bold text-foreground truncate">{swatch.name}</span>
                      <span className="font-mono text-2xs text-muted-foreground">{swatch.hex}</span>
                    </div>
                    <p className="text-2xs text-muted-foreground mt-0.5">{swatch.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Status & Telemetry Colors" description="High-visibility tones used for security state flags." icon={Bookmark} />
            <div className="p-5 space-y-4">
              {[
                { name: "Healthy / Success Green", variable: "var(--success)", hex: "#00C853", icon: Check, desc: "WordPress is protected, updates applied, sandbox cleared." },
                { name: "Alarm / Warning Orange", variable: "var(--warning)", hex: "#FFB300", icon: AlertTriangle, desc: "WordPress core updates ready, temporary caching issues." },
                { name: "Outage / Danger Red", variable: "var(--danger)", hex: "#FF3B30", icon: AlertOctagon, desc: "WooCommerce checkout outage, Stripe payment API failures." },
                { name: "System / Info Teal-Blue", variable: "var(--info)", hex: "#00C2FF", icon: Info, desc: "Staging sandbox replica status indicators." },
                { name: "Processing / Safe Execution", variable: "var(--processing)", hex: "#7C4DFF", icon: Loader2, desc: "Automated regression checks running, file synchronization." },
              ].map((swatch) => {
                const IconComponent = swatch.icon
                return (
                  <div key={swatch.name} className="flex items-center gap-4 rounded-xl border border-border p-3 bg-background/30">
                    <div 
                      className="size-12 rounded-lg border border-border shrink-0 flex items-center justify-center text-white" 
                      style={{ background: swatch.variable }} 
                    >
                      <IconComponent className={`size-5 stroke-[var(--stroke-width-thick)] ${swatch.name.startsWith("Processing") ? "animate-spin" : ""}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-bold text-foreground truncate">{swatch.name}</span>
                        <span className="font-mono text-2xs text-muted-foreground">{swatch.hex}</span>
                      </div>
                      <p className="text-2xs text-muted-foreground mt-0.5">{swatch.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Pattern & Grid Showcase */}
        <Card>
          <CardHeader title="Blueprint Grid Patterns" description="Dynamic CSS patterns overlaid to create structure and detail." icon={Grid} />
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* General Blueprint Canvas Grid */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-foreground block">1. Canvas Grid</span>
              <div className="h-28 rounded-2xl border border-border bg-blueprint-grid flex items-center justify-center p-4">
                <span className="text-2xs font-mono font-semibold bg-card text-foreground border border-border px-2 py-1 rounded-md shadow-xs">
                  .bg-blueprint-grid (24px mesh)
                </span>
              </div>
              <p className="text-2xs text-muted-foreground leading-relaxed">
                Applies a subtle structure across the page. Handled globally on the layout shell.
              </p>
            </div>

            {/* Accent Blueprint Grid */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-foreground block">2. Accent Blueprint</span>
              <div className="h-28 rounded-2xl border border-border bg-blue-blueprint flex items-center justify-center p-4 shadow-sm">
                <span className="text-2xs font-mono font-bold bg-white text-primary border border-primary/20 px-2 py-1 rounded-md shadow-xs">
                  .bg-blue-blueprint (16px white mesh)
                </span>
              </div>
              <p className="text-2xs text-muted-foreground leading-relaxed">
                Primary callouts and key telemetry headers use this bright, textured royal blue.
              </p>
            </div>

            {/* Hatch Pattern */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-foreground block">3. Warning Diagonal Hatch</span>
              <div className="h-28 rounded-2xl border border-border bg-diagonal-hatch flex items-center justify-center p-4">
                <span className="text-2xs font-mono font-semibold bg-card text-foreground border border-border px-2 py-1 rounded-md shadow-xs">
                  .bg-diagonal-hatch (10px hatch)
                </span>
              </div>
              <p className="text-2xs text-muted-foreground leading-relaxed">
                Applies dynamic warning indicators on pending tasks or alerts needing approval.
              </p>
            </div>

          </div>
        </Card>

        {/* Typography Scale */}
        <Card>
          <CardHeader title="Typography Scale" description="Neo-geometric headings pairing sans-serif sizes." icon={FileText} />
          <div className="p-6 space-y-6">
            <div className="border-b border-border/60 pb-4">
              <span className="text-2xs font-mono text-muted-foreground uppercase tracking-wider block mb-1">Page Headings (28px - Bold / Tight)</span>
              <h1 className="text-2xl sm:text-4xl-compact font-bold text-foreground tracking-tight leading-none">
                Your website is guarded. No anomalies.
              </h1>
            </div>
            <div className="border-b border-border/60 pb-4">
              <span className="text-2xs font-mono text-muted-foreground uppercase tracking-wider block mb-1">Card Headings (18px - Semibold)</span>
              <h3 className="text-lg font-bold text-foreground tracking-tight">
                WooCommerce Checkout Stream
              </h3>
            </div>
            <div className="border-b border-border/60 pb-4">
              <span className="text-2xs font-mono text-muted-foreground uppercase tracking-wider block mb-1">Body Text (14px - Regular)</span>
              <p className="text-sm text-foreground/80 leading-relaxed max-w-2xl">
                SyntaxWP monitors plugin hashes and database load around the clock. If a code drift is detected, your sandbox clone is generated automatically.
              </p>
            </div>
            <div>
              <span className="text-2xs font-mono text-muted-foreground uppercase tracking-wider block mb-1">Monospace Metadata (12px - Medium)</span>
              <code className="text-xs font-mono text-primary font-bold">
                staging-wc91-replica-db-auth-ok
              </code>
            </div>
          </div>
        </Card>

        {/* Live UI Playground */}
        <Card>
          <CardHeader title="Live UI Component Showcase" description="Bento components rendering live design tokens." icon={Laptop} />
          <div className="p-6 space-y-8">
            
            {/* Buttons State Playground */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Button Primitives</h4>
              <div className="flex flex-wrap items-center gap-3">
                <Button>
                  Primary Action
                </Button>
                <div className="bg-blue-blueprint p-2 rounded-xl border border-primary/20 flex items-center">
                  <Button variant="primary-inverted">
                    Inverted Primary
                  </Button>
                </div>
                <Button variant="secondary">
                  Secondary Action
                </Button>
                <Button variant="outline">
                  Outline Action
                </Button>
                <Button disabled className="opacity-80">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading...
                </Button>
                <button disabled className="h-10 px-4 rounded-xl text-xs font-bold bg-muted text-muted-foreground cursor-not-allowed opacity-50 border border-border">
                  Disabled state
                </button>
              </div>
            </div>

            {/* Stepper Card Playground */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Telemetry Stepper Rows (Incident Resolution)</h4>
              <div className="max-w-xl rounded-2xl border border-border bg-card p-5 space-y-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-success text-success-foreground text-3xs font-bold">✓</span>
                  <span className="text-xs font-bold text-foreground">Staging replica sandbox generated</span>
                </div>
                <div className="flex items-start gap-2.5 pl-0.5">
                  <span className="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-3xs font-bold">
                    2
                  </span>
                  <div>
                    <span className="text-xs font-bold text-foreground block">Applying WooCommerce 9.1 Compatibility Patch</span>
                    <span className="text-2xs text-muted-foreground block mt-0.5">
                      Executing automated php integrity checks inside staging container...
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 pl-0.5 opacity-50">
                  <span className="flex size-5 items-center justify-center rounded-full border border-border text-3xs font-bold">3</span>
                  <span className="text-xs font-bold text-muted-foreground">Verify payment gateways on production</span>
                </div>
              </div>
            </div>

            {/* Badges & Telemetry Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Badges Column */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status & Severity Badges</h4>
                <div className="flex flex-wrap gap-2">
                  <StatusPill status="healthy" label="Checkout Live" />
                  <StatusPill status="warning" label="Update Staged" />
                  <StatusPill status="critical" label="Outage Alarm" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <SeverityBadge severity="Low" />
                  <SeverityBadge severity="Medium" />
                  <SeverityBadge severity="High" />
                  <SeverityBadge severity="Critical" />
                </div>
              </div>

              {/* Glance Card Preview */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Interactive Navigation Cards</h4>
                <div className="group rounded-3xl border border-border bg-card p-5 shadow-xs transition-all hover:border-primary/40 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span className="text-2xs font-bold text-muted-foreground uppercase font-mono tracking-wider">Guardian</span>
                    <StatusPill status="healthy" label="Active" />
                  </div>
                  <p className="mt-3 text-sm font-bold text-foreground">SyntaxWP Guardian Active</p>
                  <p className="text-2xs text-muted-foreground mt-0.5">No unauthorized file alterations detected today.</p>
                  <span className="text-primary mt-3 inline-flex items-center gap-1 text-xs font-bold">
                    View details
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>

              {/* Mini Stat Card */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stat Telemetries</h4>
                <div className="rounded-3xl border border-border bg-card p-5 shadow-xs">
                  <span className="text-2xs text-muted-foreground font-bold uppercase tracking-wider block font-mono">Uptime Baseline</span>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span className="text-2xl font-bold tracking-tight text-foreground">99.98%</span>
                    <span className="text-3xs font-bold text-success bg-success-soft border border-success/15 px-1.5 py-0.5 rounded-md">
                      +0.02%
                    </span>
                  </div>
                  <p className="text-2xs text-muted-foreground mt-1">Average response speed: 280ms</p>
                </div>
              </div>
            </div>
            
          </div>
        </Card>

      </div>
    </AppShell>
  )
}
