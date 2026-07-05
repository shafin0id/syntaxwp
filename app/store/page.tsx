"use client"

import { useState } from "react"
import { ShoppingCart, RefreshCw, CheckCircle, AlertTriangle, ShieldCheck, DollarSign, ArrowDownToLine } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Card, CardHeader } from "@/components/ui/card"
import { StatusPill } from "@/components/ui/status"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, Sparkline, MiniBars } from "@/components/shared/charts"
import { storeProtection } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

export default function StoreProtectionPage() {
  const [activeTab, setActiveTab] = useState("monitor")
  const [testingAll, setTestingAll] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testedAgo, setTestedAgo] = useState("4 minutes ago")
  const [gatewayStates, setGatewayStates] = useState(storeProtection.paymentGateways)
  const [testingGateway, setTestingGateway] = useState<string | null>(null)

  const tabs = [
    { id: "monitor", label: "Checkout Monitor" },
    { id: "gateways", label: "Payment Gateways" },
    { id: "revenue", label: "Revenue Protected" },
    { id: "history", label: "Test History" },
  ]

  const runAllTests = () => {
    setTestingAll(true)
    setTestResult(null)
    setTimeout(() => {
      setTestingAll(false)
      setTestedAgo("Just now")
      setTestResult("WooCommerce checkout flow fully functional. Verified Stripe, PayPal & Apple Pay APIs.")
    }, 3000)
  }

  const runGatewayTest = (name: string) => {
    setTestingGateway(name)
    setTimeout(() => {
      setTestingGateway(null)
      setGatewayStates((prev) =>
        prev.map((g) => (g.name === name ? { ...g, note: "API verified: active checkout healthy" } : g))
      )
    }, 1500)
  }

  const testHistory = [
    { time: "Today, 08:14", gateway: "Stripe Pro", method: "Mobile API Check", status: "passed", response: "1.2s" },
    { time: "Today, 08:04", gateway: "PayPal Express", method: "Session Checkout", status: "passed", response: "1.5s" },
    { time: "Today, 07:54", gateway: "Apple Pay Token", method: "Synthetic Sandbox", status: "passed", response: "0.9s" },
    { time: "Today, 07:44", gateway: "Stripe Pro", method: "Standard Checkout", status: "passed", response: "1.1s" },
    { time: "Today, 07:34", gateway: "PayPal Express", method: "Session Checkout", status: "passed", response: "1.4s" },
    { time: "Today, 07:24", gateway: "Apple Pay Token", method: "Synthetic Sandbox", status: "passed", response: "0.8s" },
  ]

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Store & Checkout Protection"
          subtitle="Ensures WooCommerce cart, checkout form, and payment routes process sales correctly."
          category="TRANSACTION SAFEGUARD"
          icon={ShoppingCart}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Tab: Checkout Monitor */}
        {activeTab === "monitor" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* Healthy Status Block */}
              <Card className="flex flex-col items-center justify-center p-6 text-center border-success/40 bg-success-soft">
                <span className="relative flex size-5 mb-3">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex size-5 rounded-full bg-success" />
                </span>
                <span className="font-semibold text-lg text-success">Checkout is Live</span>
                <span className="text-xs text-muted-foreground mt-1">Last verified {testedAgo}</span>
              </Card>

              {/* Success sparkline */}
              <Card className="md:col-span-2 p-5 space-y-4">
                <h3 className="text-sm font-semibold">24h Checkout Flow Success Rate</h3>
                <div className="pt-2">
                  <Sparkline data={storeProtection.checkoutSuccess} height={80} color="var(--success)" />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>24 hours ago</span>
                  <span>144 checks today</span>
                  <span>Now (100% success)</span>
                </div>
              </Card>
            </div>

            {/* Run synthetic check */}
            <Card>
              <CardHeader title="Synthetic Sandbox Validation" description="Simulates adding products to cart, loading checkout, and fetching card gateway tokens." icon={ShoppingCart} />
              <div className="p-5 space-y-4">
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <p className="font-mono text-xs text-foreground leading-relaxed text-pretty">
                    {testingAll ? "🔍 Navigating checkout pages, executing payment web hooks..." : (testResult || "All gateways fully verified. Standard checkout response rate is excellent.")}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 pt-2">
                  <span className="text-xs text-muted-foreground">
                    10-minute check intervals
                  </span>
                  <button
                    disabled={testingAll}
                    onClick={runAllTests}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={cn("size-3.5", testingAll && "animate-spin")} />
                    {testingAll ? "Running check..." : "Run checkout test now"}
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Tab: Payment Gateways */}
        {activeTab === "gateways" && (
          <div className="space-y-4">
            {gatewayStates.map((gate) => (
              <div
                key={gate.name}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-3xl border border-border bg-card p-5 shadow-xs hover:border-primary/20 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-sm text-foreground">{gate.name} Payments</h3>
                    <StatusPill status={gate.status} />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
                    {gate.note}
                  </p>
                </div>
                <div className="shrink-0 self-end md:self-center">
                  <button
                    disabled={testingGateway !== null}
                    onClick={() => runGatewayTest(gate.name)}
                    className="rounded-lg border border-border px-3.5 py-1.5 text-xs font-semibold hover:bg-muted transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    {testingGateway === gate.name ? (
                      <>
                        <RefreshCw className="size-3 animate-spin" />
                        Testing API...
                      </>
                    ) : (
                      "Test gateway"
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab: Revenue Protected */}
        {activeTab === "revenue" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <StatCard
                label="30-day Protected Revenue"
                value={`$${storeProtection.revenue.protected30d.toLocaleString()}`}
                caption="Sales protected from plugin crashes"
                tone="success"
              />
              <StatCard
                label="Avg Hourly Sales"
                value={`$${storeProtection.revenue.avgHourly}`}
                caption="Monitored baseline sales"
                tone="primary"
              />
              <StatCard
                label="Peak Buying Hours"
                value={storeProtection.revenue.peakHours}
                caption="Enhanced checkout checking"
                tone="info"
              />
            </div>

            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-semibold">Protected Sales Allocation Baselines</h3>
              <div className="h-60 pt-4">
                {/* Visualizer bar representation */}
                <div className="flex items-end gap-3 h-full">
                  {[20, 30, 45, 60, 40, 25, 35, 50, 65, 80, 55, 40, 30, 20, 15, 30, 45, 50, 75, 90, 70, 50, 30, 20].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                      <div
                        className="w-full rounded-t-xs bg-primary hover:bg-primary/80 transition-colors"
                        style={{ height: `${h}%` }}
                      />
                      <span className="text-3xs font-mono text-muted-foreground leading-none">
                        {i}h
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Tab: Test History */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={() => alert("Downloading tests history CSV (mocked)...")}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted cursor-pointer"
              >
                <ArrowDownToLine className="size-3.5" />
                Export CSV
              </button>
            </div>

            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timestamp</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gateway</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Test Method</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Response</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {testHistory.map((hist, idx) => (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5 align-middle text-xs font-medium text-foreground">{hist.time}</td>
                        <td className="px-5 py-3.5 align-middle font-semibold text-foreground text-xs">{hist.gateway}</td>
                        <td className="px-5 py-3.5 align-middle text-xs text-muted-foreground">{hist.method}</td>
                        <td className="px-5 py-3.5 align-middle text-xs text-muted-foreground font-mono">{hist.response}</td>
                        <td className="px-5 py-3.5 align-middle text-right">
                          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                            <span className="size-1 bg-success rounded-full" />
                            Passed
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
