"use client"

import { useState } from "react"
import { Gauge, Sparkles, Smartphone, Monitor, CheckCircle, RefreshCw, Zap } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Card, CardHeader } from "@/components/ui/card"
import { StatusPill } from "@/components/ui/status"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, Sparkline, Meter } from "@/components/shared/charts"
import { performance } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

export default function PerformancePage() {
  const [activeTab, setActiveTab] = useState("overview")
  const [device, setDevice] = useState<"desktop" | "mobile">("mobile")
  const [applyingRec, setApplyingRec] = useState<string | null>(null)
  const [recList, setRecList] = useState([
    { id: "r1", label: "Compress WooCommerce transients", desc: "Reduces autloaded options database calls.", impact: "High", effort: "Low", status: "ready" },
    { id: "r2", label: "Optimize Twenty Twenty-Seven product listing images", desc: "Serves WebP formats and sizes appropriately for columns.", impact: "Medium", effort: "Low", status: "ready" },
    { id: "r3", label: "Defer non-critical third party scripts", desc: "Defers tags loading before LCP triggers.", impact: "High", effort: "Medium", status: "ready" },
  ])

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "vitals", label: "Core Web Vitals" },
    { id: "recommendations", label: "Recommendations" },
  ]

  const metricsDesktop = [
    { label: "Loading (LCP)", value: "1.1s", target: "Under 2.5s", pct: 90, status: "healthy" as const },
    { label: "Interactivity (INP)", value: "45ms", target: "Under 200ms", pct: 95, status: "healthy" as const },
    { label: "Visual stability (CLS)", value: "0.02", target: "Under 0.1", pct: 94, status: "healthy" as const },
    { label: "Time to first byte (TTFB)", value: "190ms", target: "Under 600ms", pct: 92, status: "healthy" as const },
  ]

  const metricsMobile = [
    { label: "Loading (LCP)", value: "1.8s", target: "Under 2.5s", pct: 81, status: "healthy" as const },
    { label: "Interactivity (INP)", value: "94ms", target: "Under 200ms", pct: 88, status: "healthy" as const },
    { label: "Visual stability (CLS)", value: "0.04", target: "Under 0.1", pct: 91, status: "healthy" as const },
    { label: "Time to first byte (TTFB)", value: "320ms", target: "Under 600ms", pct: 78, status: "healthy" as const },
  ]

  const activeMetrics = device === "desktop" ? metricsDesktop : metricsMobile
  const scoreValue = device === "desktop" ? 95 : 87

  const applyRecommendation = (id: string) => {
    setApplyingRec(id)
    setTimeout(() => {
      setRecList((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "applied" } : r))
      )
      setApplyingRec(null)
    }, 2000)
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Speed & Performance"
          subtitle="WooCommerce and WordPress loading times monitored automatically worldwide."
          category="PERFORMANCE ENGINE"
          icon={Gauge}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Tab content: Overview */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Header dials */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <Card className="flex flex-col items-center justify-center p-6 text-center">
                <span className="font-mono text-5xl font-bold text-success">{scoreValue}</span>
                <span className="text-sm font-semibold text-success mt-2">Excellent Health</span>
                <span className="text-xs text-muted-foreground mt-0.5">Composite Performance score</span>
              </Card>

              <Card className="md:col-span-2 p-5 space-y-4">
                <h3 className="text-sm font-semibold">14-Day Page Load Trend (seconds)</h3>
                <div className="pt-2">
                  <Sparkline data={performance.loadTrend} height={80} color="var(--success)" />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>14 days ago</span>
                  <span>Average: 1.3s</span>
                  <span>Today</span>
                </div>
              </Card>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              {activeMetrics.map((met, idx) => (
                <StatCard
                  key={idx}
                  label={met.label}
                  value={met.value}
                  caption={`Target: ${met.target}`}
                  tone={met.status === "healthy" ? "success" : "warning"}
                />
              ))}
            </div>

            {/* Glance detail callout */}
            <div className="flex items-center justify-between rounded-3xl border border-border bg-card p-5 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-success-soft text-success">
                  <Zap className="size-4.5" />
                </span>
                <div>
                  <h4 className="font-semibold text-sm">Lightning fast shop checkout page</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your checkout loads in 1.1s, performing better than 94% of shops globally.
                  </p>
                </div>
              </div>
              <StatusPill status="healthy" label="Fast" />
            </div>
          </div>
        )}

        {/* Tab content: Core Web Vitals */}
        {activeTab === "vitals" && (
          <div className="space-y-6">
            {/* Device Toggle */}
            <div className="flex justify-end">
              <div className="inline-flex rounded-lg border border-border bg-card p-1">
                <button
                  onClick={() => setDevice("mobile")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all",
                    device === "mobile" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Smartphone className="size-3.5" />
                  Mobile
                </button>
                <button
                  onClick={() => setDevice("desktop")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all",
                    device === "desktop" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Monitor className="size-3.5" />
                  Desktop
                </button>
              </div>
            </div>

            {/* Vitals Breakdown */}
            <div className="space-y-4">
              {activeMetrics.map((met, idx) => (
                <Card key={idx} className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-sm text-foreground">{met.label}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">Recommended target is {met.target}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-lg font-semibold block">{met.value}</span>
                      <StatusPill status={met.status} className="mt-0.5" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Meter value={met.pct} tone="success" />
                    <div className="flex justify-between text-2xs text-muted-foreground pt-1">
                      <span>Excellent (Good)</span>
                      <span>Needs Improvement</span>
                      <span>Poor</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Tab content: Recommendations */}
        {activeTab === "recommendations" && (
          <div className="space-y-4">
            {recList.map((rec) => (
              <div
                key={rec.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-3xl border border-border bg-card p-5 shadow-xs hover:border-primary/20 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-sm text-foreground">{rec.label}</h3>
                    <StatusPill status="info" label={`Impact: ${rec.impact}`} />
                    <span className="text-xs text-muted-foreground">Effort: {rec.effort}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
                    {rec.desc}
                  </p>
                </div>
                <div className="shrink-0 self-end md:self-center">
                  {rec.status === "applied" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
                      <CheckCircle className="size-3.5" />
                      Applied
                    </span>
                  ) : (
                    <button
                      disabled={applyingRec !== null}
                      onClick={() => applyRecommendation(rec.id)}
                      className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      {applyingRec === rec.id ? (
                        <>
                          <RefreshCw className="size-3 animate-spin" />
                          Applying...
                        </>
                      ) : (
                        "Apply automatically"
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
