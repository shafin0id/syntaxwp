/**
 * StatusRail Component
 *
 * Renders the global status sidebar showing store health score dial, current operational
 * statuses (Stripe, Cloudflare, etc.), and recent restore point list.
 */

"use client"

import { apiFetch } from "@/lib/api-fetch"
import { useState, useEffect } from "react"
import Link from "next/link"
import { RotateCcw, Lock, RefreshCw, ShieldAlert, ChevronRight, History } from "lucide-react"
import { HealthDial } from "@/components/shared/health-dial"
import { StatusDot } from "@/components/ui/status"
import { useStream } from "@/lib/stream-context"

export function StatusRail() {
  const [securityData, setSecurityData] = useState<any>(null)
  const [restorePoints, setRestorePoints] = useState<any[]>([])
  const [pendingUpdatesCount, setPendingUpdatesCount] = useState(0)
  const { incidentsList } = useStream()

  const awaitingCount = incidentsList.filter((i) => i.stage === "awaiting-approval").length

  useEffect(() => {
    apiFetch(`/api/security`)
      .then((r) => r.json())
      .then((data) => setSecurityData(data))
      .catch(console.error);

    apiFetch(`/api/restore-points`)
      .then((r) => r.json())
      .then((data) => setRestorePoints(data))
      .catch(console.error);

    apiFetch(`/api/updates`)
      .then((r) => r.json())
      .then((data) => setPendingUpdatesCount(Array.isArray(data) ? data.length : 0))
      .catch(console.error);
  }, []);

  return (
    <aside className="hidden w-rail-width shrink-0 border-l border-border bg-sidebar/40 xl:block">
      <div className="sticky top-header-height flex h-[calc(100vh-var(--spacing-header-height))] flex-col gap-5 overflow-y-auto p-5">

        {/* Health dial */}
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-5">
          <HealthDial score={securityData?.healthScore ?? 95} size={148} />
          <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground text-pretty">
            Your site is in great shape. We're watching it every 60 seconds.
          </p>
        </div>

        {/* Quick status list */}
        <div className="rounded-2xl border border-border bg-card p-2 space-y-0.5">
          <StatusRow
            icon={<ShieldAlert className="size-4 text-danger" />}
            label={
              awaitingCount > 0
                ? `${awaitingCount} issue${awaitingCount === 1 ? "" : "s"} need${awaitingCount === 1 ? "s" : ""} your OK`
                : "No issues need your attention"
            }
            href="/incidents"
          />
          <StatusRow
            icon={<RefreshCw className="size-4 text-warning" />}
            label={
              pendingUpdatesCount > 0
                ? `${pendingUpdatesCount} update${pendingUpdatesCount === 1 ? "" : "s"} ready to install`
                : "All updates installed"
            }
            href="/updates"
          />
          <StatusRow
            icon={<Lock className="size-4 text-success" />}
            label={`SSL secure · ${securityData?.sslDays ?? 84} days left`}
            href="/security"
          />
          <StatusRow
            icon={<History className="size-4 text-success" />}
            label={restorePoints.length > 0 ? `Last backup: ${restorePoints[0].time}` : "Last backup: 2h ago"}
            href="/restore-points"
          />
        </div>

        {/* Restore points */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Restore points
            </p>
            <Link href="/restore-points" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <ul className="mt-3 space-y-2.5">
            {restorePoints.slice(0, 4).map((rp) => (
              <li key={rp.id} className="flex items-center gap-2.5">
                <StatusDot status="healthy" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{rp.label}</p>
                  <p className="truncate text-xs-compact text-muted-foreground">{rp.time}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/restore-points"
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted"
          >
            <RotateCcw className="size-3.5" />
            Revert to a point
          </Link>
        </div>
      </div>
    </aside>
  )
}

function StatusRow({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode
  label: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:bg-muted/60"
    >
      {icon}
      <span className="flex-1 text-xs font-medium">{label}</span>
      <ChevronRight className="size-3.5 text-muted-foreground" />
    </Link>
  )
}
