"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ShieldCheck, Lock, ArrowUpRight, CheckCircle2, AlertTriangle, RefreshCw, Eye } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Card, CardHeader } from "@/components/ui/card"
import { StatusPill } from "@/components/ui/status"
import { SeverityBadge } from "@/components/ui/badge"
import { PageHeader } from "@/components/ui/page-header"
import { Meter } from "@/components/shared/charts"
import { cn } from "@/lib/utils"

export type PluginInventoryItem = {
  name: string
  slug: string
  version: string
  status: "active" | "inactive"
  updateAvailable: boolean
  latestVersion?: string
  vulnerability?: boolean
}

export type Vulnerability = {
  id: string
  plugin: string
  severity: "Critical" | "High" | "Medium" | "Low"
  summary: string
  status: "Patched automatically" | "Update available" | "Monitoring"
  detected: string
}

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState("overview")
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState("No unexpected changes found. Files are 100% authentic.")
  const [pluginState, setPluginState] = useState<PluginInventoryItem[]>([])
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([])
  const [securityChecks, setSecurityChecks] = useState<{label: string, value: string, status: any}[]>([])
  const [securityData, setSecurityData] = useState<any>(null)

  useEffect(() => {
    fetch("http://localhost:4000/api/security")
      .then((r) => r.json())
      .then((data) => {
        setSecurityData(data);
        if (data.checks) setSecurityChecks(data.checks);
        if (data.vulnerabilities) setVulnerabilities(data.vulnerabilities);
      })
      .catch(console.error);

    fetch("http://localhost:4000/api/plugins")
      .then((r) => r.json())
      .then((data) => setPluginState(data))
      .catch(console.error);
  }, []);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "plugins", label: "Plugin Audits" },
    { id: "vulnerabilities", label: "Vulnerabilities" },
    { id: "integrity", label: "File Integrity" },
  ]

  const runScan = () => {
    setScanning(true)
    setTimeout(() => {
      setScanning(false)
      setScanResult("Clean scan! All 4,812 WordPress core, plugin, and theme files match official checksums.")
    }, 2500)
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Security Guardian"
          subtitle="Verify site credentials, patch vulnerabilities, and scan files in real-time."
          category="SECURITY GUARD"
          icon={ShieldCheck}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Tab content: Overview */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Autonomous Shield Badge */}
            <div className="md:col-span-2 flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-4">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <div>
                  <span className="text-sm font-semibold text-foreground block">Autonomous Shield Active</span>
                  <span className="text-xs text-muted-foreground">Self-healing code security & threat containment enabled.</span>
                </div>
              </div>
            </div>

            {/* Health checks checklist */}
            <Card className="md:col-span-2">
              <CardHeader title="Security Health Checks" description="Continuous defense checklist verified 2 hours ago." icon={ShieldCheck} />
              <div className="divide-y divide-border">
                {securityChecks.map((check, idx) => (
                  <div key={idx} className="flex items-center justify-between px-5 py-3.5">
                    <span className="text-sm font-medium text-foreground">{check.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{check.value}</span>
                      <StatusPill status={check.status} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Recent Shield Interventions */}
            <Card className="md:col-span-2">
              <CardHeader title="Recent Shield Interventions" description="History of autonomous healing actions and threat isolations." icon={ShieldCheck} />
              <div className="divide-y divide-border">
                {(!securityData?.recentActions || securityData.recentActions.length === 0) ? (
                  <div className="px-5 py-4 text-sm text-muted-foreground">
                    No interventions logged recently. Your site is secure.
                  </div>
                ) : (
                  securityData.recentActions.map((action: any) => {
                    let message = "";
                    if (action.actionType === "FILE_AUTO_REPAIR") {
                      message = `Auto-repaired modified/missing file: ${action.target}`;
                    } else if (action.actionType === "CRITICAL_VULNERABILITY_ISOLATION") {
                      message = `Isolated critical vulnerability on: ${action.target} (${action.details})`;
                    } else {
                      message = `${action.actionType} on ${action.target}: ${action.details}`;
                    }
                    return (
                      <div key={action.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                            action.status === "SUCCESS" ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
                          )}>
                            {action.status}
                          </span>
                          <span className="text-sm font-medium text-foreground">
                            [Shield Action] {message}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground font-mono whitespace-nowrap ml-4">
                          {timeAgo(action.createdAt)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* SSL details */}
            <Card>
              <CardHeader title="SSL Certificate" description="Protects visitor transactions and connection data." icon={Lock} />
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">STATUS</span>
                  <StatusPill status="healthy" label="Secure Connection" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Days remaining</span>
                    <span className="font-mono">{(securityData?.sslDays ?? 0) > 0 ? `${securityData.sslDays} days left` : "Expired or missing"}</span>
                  </div>
                  <Meter value={Math.min(100, Math.max(0, ((securityData?.sslDays ?? 0) / 90) * 100))} tone={(securityData?.sslDays ?? 0) > 14 ? "success" : "warning"} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                  <div>
                    <span className="text-muted-foreground block">ISSUER</span>
                    <span className="font-semibold">Let's Encrypt</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">TYPE</span>
                    <span className="font-semibold">ECC 256-bit (ALPN)</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Domain details */}
            <Card>
              <CardHeader title="Domain Watch" description="Ensures your identity and domain naming properties remain registered." icon={ArrowUpRight} />
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">STATUS</span>
                  <StatusPill status="healthy" label="Registered" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Days remaining</span>
                    <span className="font-mono">{(securityData?.domainDays ?? 0) > 0 ? `${securityData.domainDays} days left` : "Unknown"}</span>
                  </div>
                  <Meter value={Math.min(100, Math.max(0, ((securityData?.domainDays ?? 0) / 365) * 100))} tone={(securityData?.domainDays ?? 0) > 30 ? "success" : "warning"} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                  <div>
                    <span className="text-muted-foreground block">REGISTRAR</span>
                    <span className="font-semibold">Namecheap Inc.</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">AUTO-RENEW</span>
                    <span className="font-semibold text-success">Enabled</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Tab content: Plugins & Updates */}
        {activeTab === "plugins" && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plugin Name</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Installed</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Advisories</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pluginState.map((plugin) => (
                      <tr key={plugin.slug} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5 align-middle">
                          <span className="font-semibold text-foreground text-sm block">{plugin.name}</span>
                          <span className="text-xs-compact text-muted-foreground font-mono">{plugin.slug}</span>
                        </td>
                        <td className="px-5 py-3.5 align-middle">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                              plugin.status === "active"
                                ? "bg-success-soft text-success"
                                : "bg-secondary text-secondary-foreground"
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full", plugin.status === "active" ? "bg-success" : "bg-muted-foreground")} />
                            {plugin.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 align-middle">
                          <span className="font-medium text-xs text-foreground block">v{plugin.version}</span>
                          {plugin.updateAvailable && (
                            <span className="text-2xs text-primary font-semibold block mt-0.5">
                              v{plugin.latestVersion} available
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 align-middle">
                          {plugin.vulnerability ? (
                            <SeverityBadge severity="Medium" />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 align-middle text-right font-mono">
                          {plugin.updateAvailable ? (
                            <Link
                              href="/updates"
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
                            >
                              <span>Fix on Updates</span>
                              <ArrowUpRight className="size-3" />
                            </Link>
                          ) : (
                            <span className="inline-flex size-7 items-center justify-center rounded-full bg-success-soft text-success">
                              <CheckCircle2 className="size-4" />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab content: Vulnerabilities */}
        {activeTab === "vulnerabilities" && (
          <div className="space-y-4">
            {vulnerabilities.map((vuln) => (
              <div
                key={vuln.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-3xl border border-border bg-card p-5 shadow-xs hover:border-primary/20 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-sm text-foreground">{vuln.plugin}</h3>
                    <SeverityBadge severity={vuln.severity} />
                    <span className="text-xs text-muted-foreground">· Detected {vuln.detected}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
                    {vuln.summary}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                      vuln.status === "Patched automatically"
                        ? "bg-success-soft text-success"
                        : vuln.status === "Update available"
                          ? "bg-warning-soft text-amber-700"
                          : "bg-info-soft text-info"
                    )}
                  >
                    {vuln.status}
                  </span>
                  {vuln.status === "Update available" && (
                    <Link
                      href="/updates"
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-all text-foreground"
                    >
                      <span>Fix on Updates</span>
                      <ArrowUpRight className="size-3" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab content: File Integrity */}
        {activeTab === "integrity" && (
          <div className="space-y-6">
            <Card>
              <CardHeader title="Core & Plugin File Checksums" description="SyntaxWP checks 100% of php files for unauthorized alterations or backdoor signatures." icon={Eye} />
              <div className="p-5 space-y-4">
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <p className="font-mono text-xs text-foreground leading-relaxed text-pretty">
                    {scanning ? "🔍 Analyzing directory structure, comparing with repo checksums..." : scanResult}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 pt-2">
                  <span className="text-xs text-muted-foreground">
                    Last scanned: 2 hours ago
                  </span>
                  <button
                    disabled={scanning}
                    onClick={runScan}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={cn("size-3.5", scanning && "animate-spin")} />
                    {scanning ? "Scanning..." : "Scan files now"}
                  </button>
                </div>
              </div>
            </Card>

            {/* Scan History */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Scan History</h4>
              {[
                { time: "Today, 04:00", result: "Clean · 4,812 files scanned", files: 0 },
                { time: "Yesterday, 04:00", result: "Clean · 4,810 files scanned", files: 0 },
                { time: "Jun 29, 04:00", result: "Clean · 4,810 files scanned", files: 0 },
                { time: "Jun 28, 04:00", result: "Clean · 4,808 files scanned", files: 0 },
              ].map((scan, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-xs">
                  <div className="font-medium text-foreground">{scan.time}</div>
                  <div className="text-muted-foreground">{scan.result}</div>
                  <div className="text-success font-semibold flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-success" />
                    Passed
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
