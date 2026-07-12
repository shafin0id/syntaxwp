"use client"

import { useState, useEffect } from "react"
import { Gauge, Smartphone, Monitor, CheckCircle, RefreshCw, Zap, Shield, AlertTriangle, Clock } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Card } from "@/components/ui/card"
import { StatusPill } from "@/components/ui/status"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, Sparkline, Meter } from "@/components/shared/charts"
import { cn } from "@/lib/utils"

type VitalMetric = {
  value: string; target: string; status: "healthy" | "warning"; pct: number; delta: number | null
}
type VitalsPayload = { lcp: VitalMetric; inp: VitalMetric; cls: VitalMetric; ttfb: VitalMetric; collectedAt: string }

export default function PerformancePage() {
  const [activeTab, setActiveTab] = useState("desktop")
  const [applyingRec, setApplyingRec] = useState<string | null>(null)
  const [recList, setRecList] = useState([
    { id: "r1", label: "Compress WooCommerce transients", desc: "Reduces autoloaded options database calls.", impact: "High", effort: "Low", status: "ready" },
    { id: "r2", label: "Optimize product listing images", desc: "Serves WebP formats and sizes appropriately for columns.", impact: "Medium", effort: "Low", status: "ready" },
    { id: "r3", label: "Defer non-critical third party scripts", desc: "Defers tags loading before LCP triggers.", impact: "High", effort: "Medium", status: "ready" },
  ])
  const [perfData, setPerfData] = useState<any>(null)

  useEffect(() => {
    fetch("http://localhost:4000/api/performance")
      .then((r) => r.json())
      .then((data) => setPerfData(data))
      .catch(console.error)
  }, [])

  const tabs = [
    { id: "desktop", label: "Desktop Vitals" },
    { id: "mobile", label: "Mobile Vitals" },
    { id: "synthetic", label: "Real-Time TTFB" },
    { id: "shield", label: "Performance Shield" },
    { id: "recommendations", label: "Recommendations" },
  ]

  const applyRecommendation = (id: string) => {
    setApplyingRec(id)
    setTimeout(() => {
      setRecList((prev) => prev.map((r) => (r.id === id ? { ...r, status: "applied" } : r)))
      setApplyingRec(null)
    }, 2000)
  }

  const VitalsCard = ({ vital, label }: { vital: VitalMetric | undefined; label: string }) => {
    if (!vital) return (
      <Card className="p-5 space-y-3 opacity-50">
        <div className="flex items-start justify-between">
          <div><h4 className="font-semibold text-sm text-foreground">{label}</h4><p className="text-xs text-muted-foreground">No data yet</p></div>
        </div>
      </Card>
    )
    return (
      <Card className="p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="font-semibold text-sm text-foreground">{label}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">Target: {vital.target}</p>
          </div>
          <div className="text-right">
            <span className="font-mono text-lg font-semibold block">{vital.value}</span>
            <div className="flex items-center gap-2 mt-0.5 justify-end">
              <StatusPill status={vital.status} />
              {vital.delta !== null && (
                <span className={cn("text-xs font-medium", vital.delta >= 0 ? "text-success" : "text-destructive")}>
                  {vital.delta >= 0 ? `+${vital.delta}%` : `${vital.delta}%`} vs 30d
                </span>
              )}
            </div>
          </div>
        </div>
        <Meter value={vital.pct} tone={vital.status === "healthy" ? "success" : "warning"} />
      </Card>
    )
  }

  const score = perfData?.score ?? 87

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Speed & Performance"
          subtitle="Autonomous monitoring with real-time TTFB and zero-LLM auto-remediation."
          category="PERFORMANCE ENGINE"
          icon={Gauge}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Score bar always visible */}
        <Card className="flex items-center gap-5 p-5">
          <div className="flex flex-col items-center justify-center min-w-[72px]">
            <span className={cn("font-mono text-4xl font-bold", score >= 80 ? "text-success" : score >= 60 ? "text-warning" : "text-destructive")}>{score}</span>
            <span className="text-2xs text-muted-foreground mt-0.5">Perf score</span>
          </div>
          <div className="flex-1">
            <Meter value={score} tone={score >= 80 ? "success" : "warning"} />
            <p className="text-xs text-muted-foreground mt-1.5">Composite score driven by live synthetic TTFB + Core Web Vitals</p>
          </div>
        </Card>

        {/* Desktop Vitals */}
        {activeTab === "desktop" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-1">
              <Monitor className="size-4" /> Desktop · CrUX p75 (daily)
            </div>
            {perfData?.desktop ? (
              <div className="space-y-3">
                <VitalsCard vital={perfData.desktop.lcp} label="Loading (LCP)" />
                <VitalsCard vital={perfData.desktop.inp} label="Interactivity (INP)" />
                <VitalsCard vital={perfData.desktop.cls} label="Visual Stability (CLS)" />
                <VitalsCard vital={perfData.desktop.ttfb} label="Time to First Byte (TTFB)" />
                <p className="text-2xs text-muted-foreground text-right">Collected {new Date(perfData.desktop.collectedAt).toLocaleString()}</p>
              </div>
            ) : (
              <Card className="p-8 text-center text-sm text-muted-foreground">No desktop vitals yet. Collected daily at 06:00 UTC.</Card>
            )}
          </div>
        )}

        {/* Mobile Vitals */}
        {activeTab === "mobile" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-1">
              <Smartphone className="size-4" /> Mobile · CrUX p75 (daily)
            </div>
            {perfData?.mobile ? (
              <div className="space-y-3">
                <VitalsCard vital={perfData.mobile.lcp} label="Loading (LCP)" />
                <VitalsCard vital={perfData.mobile.inp} label="Interactivity (INP)" />
                <VitalsCard vital={perfData.mobile.cls} label="Visual Stability (CLS)" />
                <VitalsCard vital={perfData.mobile.ttfb} label="Time to First Byte (TTFB)" />
                <p className="text-2xs text-muted-foreground text-right">Collected {new Date(perfData.mobile.collectedAt).toLocaleString()}</p>
              </div>
            ) : (
              <Card className="p-8 text-center text-sm text-muted-foreground">No mobile vitals yet. Collected daily at 06:00 UTC.</Card>
            )}
          </div>
        )}

        {/* Synthetic Real-Time TTFB */}
        {activeTab === "synthetic" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-1">
              <Zap className="size-4" /> Synthetic TTFB · every 15 minutes
            </div>
            {perfData?.synthetic ? (
              <div className="space-y-4">
                <Card className="p-5 flex items-center gap-5">
                  <div className="min-w-[80px] text-center">
                    <span className={cn("font-mono text-3xl font-bold", perfData.synthetic.ttfb.status === "healthy" ? "text-success" : "text-destructive")}>
                      {perfData.synthetic.ttfb.value}
                    </span>
                    <p className="text-2xs text-muted-foreground mt-0.5">Live TTFB</p>
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Baseline (30d avg): <strong>{perfData.synthetic.ttfb.baseline}</strong></span>
                      {perfData.synthetic.ttfb.delta !== null && (
                        <span className={cn("font-semibold", perfData.synthetic.ttfb.delta >= 0 ? "text-success" : "text-destructive")}>
                          {perfData.synthetic.ttfb.delta >= 0 ? `+${perfData.synthetic.ttfb.delta}%` : `${perfData.synthetic.ttfb.delta}%`} vs baseline
                        </span>
                      )}
                    </div>
                    <StatusPill status={perfData.synthetic.ttfb.status} label={perfData.synthetic.ttfb.status === "healthy" ? "Within baseline" : "Regression detected"} />
                  </div>
                </Card>
                {perfData.synthetic.trend?.length > 1 && (
                  <Card className="p-5">
                    <h3 className="text-sm font-semibold mb-3">TTFB Trend (last 48 pings)</h3>
                    <Sparkline data={perfData.synthetic.trend.map((t: any) => t.ttfb ?? 0)} height={72} color="var(--primary)" />
                    <div className="flex justify-between text-2xs text-muted-foreground mt-2">
                      <span>Oldest</span>
                      <span>Latest</span>
                    </div>
                  </Card>
                )}
              </div>
            ) : (
              <Card className="p-8 text-center text-sm text-muted-foreground">No synthetic data yet. Pings run every 15 minutes.</Card>
            )}
          </div>
        )}

        {/* Autonomous Performance Shield */}
        {activeTab === "shield" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-1">
              <Shield className="size-4 text-primary" /> Autonomous Performance Shield
            </div>
            <Card className="p-4 space-y-1 border-primary/20 bg-primary/5">
              <p className="text-xs text-muted-foreground leading-relaxed">
                The Performance Shield automatically detects TTFB regressions and runs remediation without human intervention:
                <strong> Step 1</strong> — Cache Flush → re-ping.
                <strong> Step 2</strong> — Autoload audit + transient cleanup if &gt;1.5MB.
                <strong> Step 3</strong> — Cache warm-up on /, /shop/, /blog/.
              </p>
            </Card>
            {perfData?.shieldLogs?.length > 0 ? (
              <div className="space-y-3">
                {perfData.shieldLogs.map((log: any) => (
                  <Card key={log.id} className="p-4 flex items-start gap-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {log.summary.toLowerCase().includes("resolved") ? <CheckCircle className="size-4" /> : log.summary.toLowerCase().includes("emergency") ? <AlertTriangle className="size-4 text-destructive" /> : <Shield className="size-4" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{log.summary}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock className="size-3" />
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
                      {log.evidence && (
                        <div className="mt-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 font-mono text-2xs text-muted-foreground">
                          {Object.entries(log.evidence as Record<string, any>)
                            .filter(([k]) => k !== "paths")
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center text-sm text-muted-foreground">No shield events yet — site is healthy or pings haven't run.</Card>
            )}
          </div>
        )}

        {/* Recommendations */}
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
                    <StatusPill status="warning" label={`Impact: ${rec.impact}`} />
                    <span className="text-xs text-muted-foreground">Effort: {rec.effort}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed text-pretty">{rec.desc}</p>
                </div>
                <div className="shrink-0 self-end md:self-center">
                  {rec.status === "applied" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
                      <CheckCircle className="size-3.5" /> Applied
                    </span>
                  ) : (
                    <button
                      disabled={applyingRec !== null}
                      onClick={() => applyRecommendation(rec.id)}
                      className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      {applyingRec === rec.id ? <><RefreshCw className="size-3 animate-spin" /> Applying...</> : "Apply automatically"}
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
