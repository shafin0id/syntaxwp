import Link from "next/link"
import {
  ShieldCheck,
  Wrench,
  Activity,
  Gauge,
  ShoppingCart,
  Lock,
  RefreshCw,
  ChevronRight,
  DollarSign,
} from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { ExecutionStepperCard } from "@/components/shared/execution-stepper"
import { WelcomeBanner } from "@/components/shared/welcome-banner"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { activeIncident, activeDatabaseIncident, activityFeed, site } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

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
      className="group bg-card rounded-3xl border border-border p-5 shadow-xs hover:border-primary/20 hover:shadow-sm transition-all duration-300 flex flex-col justify-between min-h-glance-card-min-h"
    >
      <div className="space-y-1">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground/70" />
          <span className="text-sm font-medium text-muted-foreground">
            {title}
          </span>
        </div>

        {/* Value */}
        <div className="text-3xl-compact font-bold tracking-tight text-foreground pt-1.5 leading-none">
          {value}
        </div>
      </div>

      {/* Footer / Status */}
      <div className="flex items-center gap-1.5 mt-3.5">
        <span
          className={cn(
            "size-2 rounded-full shrink-0",
            statusColor === "success" ? "bg-success" : "bg-primary"
          )}
        />
        <span className="text-xs-compact text-muted-foreground truncate font-medium">
          {statusText}
        </span>
      </div>
    </Link>
  )
}

export default function OverviewPage() {
  const overviewCards = [
    {
      title: "Speed",
      value: "1.1s",
      icon: Gauge,
      statusText: "Fast, top 8%",
      statusColor: "success" as const,
      href: "/performance",
    },
    {
      title: "Fixes",
      value: "48",
      icon: Wrench,
      statusText: "Auto-fixed this mo...",
      statusColor: "info" as const,
      href: "/incidents",
    },
    {
      title: "Checkout",
      value: "Ready",
      icon: ShoppingCart,
      statusText: "All payment metho...",
      statusColor: "success" as const,
      href: "/store",
    },
    {
      title: "Security",
      value: "100%",
      icon: ShieldCheck,
      statusText: "Fully protected",
      statusColor: "success" as const,
      href: "/security",
    },
    {
      title: "Uptime",
      value: `${site.uptime30d}%`,
      icon: Activity,
      statusText: "This month",
      statusColor: "success" as const,
      href: "/performance",
    },
    {
      title: "Revenue",
      value: "$14,280",
      icon: DollarSign,
      statusText: "Estimated sales saved",
      statusColor: "success" as const,
      href: "/store",
    },
  ]

  return (
    <AppShell>
      <div className="space-y-8 animate-tab-content">
        {/* Row 1: Welcome Banner (Greetings at the very top) */}
        <WelcomeBanner />

        {/* Row 2: Overview Cards (3 Column Grid / 2 Rows for wider cards) */}
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

        {/* Row 3: Needs your attention / Awaiting approval (Incidents) */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-danger text-white text-xs font-bold shadow-xs">
              2
            </span>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Needs your approval
            </h2>
          </div>
          <div className="space-y-4">
            <ExecutionStepperCard incident={activeDatabaseIncident} variant="overview" />
            <ExecutionStepperCard incident={activeIncident} variant="overview" />
          </div>
        </section>

        {/* Row 4: What we've been doing */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold shadow-xs">
              {activityFeed.length}
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
              {activityFeed.map((a) => {
                let badgeText = "Verified"
                let badgeVariant: "success" | "primary" | "secondary" | "danger" | "processing" = "success"
                let desc = a.text
                let time = a.time

                if (a.id === "a1") {
                  badgeText = "Verified"
                  badgeVariant = "success"
                  desc = "Checkout tested across 3 payment methods"
                  time = "4 min ago"
                } else if (a.id === "a2") {
                  badgeText = "Monitoring"
                  badgeVariant = "primary"
                  desc = "New security advisory matched to LiteSpeed Cache"
                  time = "6 hours ago"
                } else if (a.id === "a3") {
                  badgeText = "Snapshot"
                  badgeVariant = "processing"
                  desc = "Daily safety snapshot created"
                  time = "Today, 04:00"
                } else if (a.id === "a4") {
                  badgeText = "Auto-fixed"
                  badgeVariant = "success"
                  desc = "Homepage speed improved automatically"
                  time = "2 days ago"
                } else if (a.id === "a5") {
                  badgeText = "Security"
                  badgeVariant = "processing"
                  desc = "Contact Form 7 security patch applied"
                  time = "5 days ago"
                }

                return (
                  <div key={a.id} className="flex items-center justify-between py-4 gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <Badge variant={badgeVariant}>
                        {badgeText}
                      </Badge>
                      <span className="text-sm font-medium text-foreground truncate">
                        {desc}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {time}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        </section>
      </div>
    </AppShell>
  )
}

