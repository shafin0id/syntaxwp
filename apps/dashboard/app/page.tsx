"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  ShieldCheck,
  Wrench,
  Activity,
  Gauge,
  ShoppingCart,
  ShieldAlert,
  RefreshCw,
  ChevronRight,
  DollarSign,
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { ExecutionStepperCard } from "@/components/shared/execution-stepper"
import { WelcomeBanner } from "@/components/shared/welcome-banner"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { mapApiIncidentToDashboardIncident } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useStream } from "@/lib/stream-context"

function MetricCard({
  title,
  value,
  icon: Icon,
  statusText,
  statusColor,
  href,
}: {
  title: string
  value: string
  icon: React.ComponentType<any>
  statusText: string
  statusColor: "success" | "info"
  href: string
}) {
  return (
    <Link
      href={href}
      className="group bg-card rounded-3xl border border-border p-5 shadow-xs hover:border-primary/20 hover:shadow-sm transition-all duration-300 flex flex-col justify-between min-h-[160px]"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground/70" />
          <span className="text-sm font-medium text-muted-foreground">
            {title}
          </span>
        </div>
        <div className="text-[28px] font-bold tracking-tight text-foreground pt-1.5 leading-none">
          {value}
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-3.5">
        <span
          className={cn(
            "size-2 rounded-full shrink-0",
            statusColor === "success" ? "bg-success" : "bg-primary"
          )}
        />
        <span className="text-xs text-muted-foreground truncate font-medium">
          {statusText}
        </span>
      </div>
    </Link>
  )
}

export default function OverviewPage() {
  const { incidentsList, refetch: fetchIncidents } = useStream()
  const [performanceData, setPerformanceData] = useState<any>(null)
  const [securityData, setSecurityData] = useState<any>(null)
  const [storeData, setStoreData] = useState<any>(null)

  useEffect(() => {
    fetch("http://localhost:4000/api/performance")
      .then((r) => r.json())
      .then((data) => setPerformanceData(data))
      .catch(console.error)

    fetch("http://localhost:4000/api/security")
      .then((r) => r.json())
      .then((data) => setSecurityData(data))
      .catch(console.error)

    fetch("http://localhost:4000/api/store")
      .then((r) => r.json())
      .then((data) => setStoreData(data))
      .catch(console.error)
  }, [])

  const activeIncidents = incidentsList.filter((inc) => inc.stage !== "resolved")
  const resolvedIncidents = incidentsList.filter((inc) => inc.stage === "resolved")

  const lcp = performanceData?.metrics?.[0]?.value || "1.4s"
  const healthScore = securityData?.healthScore || 95
  const vulnerabilitiesCount = securityData?.vulnerabilitiesCount || 0

  const overviewCards = [
    {
      title: "Speed",
      value: lcp,
      icon: Gauge,
      statusText: "Fast, top 8%",
      statusColor: "success" as const,
      href: "/performance",
    },
    {
      title: "Fixes",
      value: String(resolvedIncidents.length),
      icon: Wrench,
      statusText: "Auto-fixed history",
      statusColor: "info" as const,
      href: "/incidents",
    },
    {
      title: "Checkout",
      value: activeIncidents.some((i) => i.category === "Checkout") ? "Interrupted" : "Ready",
      icon: ShoppingCart,
      statusText: activeIncidents.some((i) => i.category === "Checkout") ? "Checkout failure spotted" : "All payment methods online",
      statusColor: activeIncidents.some((i) => i.category === "Checkout") ? ("info" as const) : ("success" as const),
      href: "/store",
    },
    {
      title: "Security",
      value: `${healthScore}%`,
      icon: ShieldCheck,
      statusText: vulnerabilitiesCount > 0 ? `${vulnerabilitiesCount} issues logged` : "Fully protected",
      statusColor: healthScore > 85 ? ("success" as const) : ("info" as const),
      href: "/security",
    },
    {
      title: "Uptime",
      value: "99.98%",
      icon: Activity,
      statusText: "This month",
      statusColor: "success" as const,
      href: "/performance",
    },
    {
      title: "Revenue",
      value: storeData?.revenue?.protected30d ? `$${storeData.revenue.protected30d.toLocaleString()}` : "$14,280",
      icon: DollarSign,
      statusText: "Estimated sales saved",
      statusColor: "success" as const,
      href: "/store",
    },
  ]

  return (
    <AppShell>
      <div className="space-y-8 animate-tab-content">
        <WelcomeBanner />

        <section className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {overviewCards.map((card) => (
            <MetricCard
              key={card.title}
              title={card.title}
              value={card.value}
              icon={card.icon}
              statusText={card.statusText}
              statusColor={card.statusColor}
              href={card.href}
            />
          ))}
        </section>

        {activeIncidents.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-danger text-white text-xs font-bold shadow-xs">
                {activeIncidents.length}
              </span>
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Needs your approval
              </h2>
            </div>
            <div className="space-y-4">
              {activeIncidents.map((inc) => (
                <ExecutionStepperCard 
                  key={inc.id} 
                  incident={inc} 
                  variant="overview" 
                  onActionComplete={fetchIncidents}
                />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold shadow-xs">
              {resolvedIncidents.length}
            </span>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              What we've been doing
            </h2>
          </div>
          <Card>
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <h3 className="text-sm font-bold text-foreground">Recent Activity</h3>
              <Link
                href="/incidents"
                className="text-sm font-semibold text-primary hover:underline flex items-center gap-0.5"
              >
                See all logs &rarr;
              </Link>
            </div>
            <div className="px-6 py-2 divide-y divide-border">
              {resolvedIncidents.length === 0 ? (
                <div className="py-6 text-sm text-muted-foreground text-center">
                  No resolved history found. Fixes will populate here as they complete.
                </div>
              ) : (
                resolvedIncidents.slice(0, 5).map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-4 gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <Badge variant="success">Resolved</Badge>
                      <span className="text-sm font-medium text-foreground truncate">
                        {a.subtitle}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {a.detectedAgo}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </section>
      </div>
    </AppShell>
  )
}
