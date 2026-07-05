/**
 * Status Components & Configuration
 * 
 * Provides StatusPill and StatusDot components representing operational state health (healthy, warning, critical).
 * Uses semantic color design tokens (success, warning, danger).
 */

import { Check, AlertTriangle, AlertOctagon, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Status } from "@/lib/mock-data"

export const statusConfig: Record<
  Status,
  { label: string; dot: string; soft: string; text: string; icon: LucideIcon }
> = {
  healthy: {
    label: "Healthy",
    dot: "bg-success",
    soft: "bg-success-soft text-success",
    text: "text-success",
    icon: Check,
  },
  warning: {
    label: "Needs attention",
    dot: "bg-warning",
    soft: "bg-warning-soft text-warning-foreground",
    text: "text-warning-foreground",
    icon: AlertTriangle,
  },
  critical: {
    label: "Urgent",
    dot: "bg-danger",
    soft: "bg-danger-soft text-danger",
    text: "text-danger",
    icon: AlertOctagon,
  },
}

/**
 * StatusPill Component
 * 
 * Renders a color-coded pill representing healthy, warning, or critical status.
 * 
 * Usage example:
 * ```tsx
 * <StatusPill status="healthy" />
 * ```
 */
export function StatusPill({
  status,
  label,
  className,
}: {
  status: Status
  label?: string
  className?: string
}) {
  const cfg = statusConfig[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        cfg.soft,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", cfg.dot)} />
      {label ?? cfg.label}
    </span>
  )
}

/**
 * StatusDot Component
 * 
 * Renders a small dot indicator, optionally pulsing.
 * 
 * Usage example:
 * ```tsx
 * <StatusDot status="healthy" pulse />
 * ```
 */
export function StatusDot({ status, pulse }: { status: Status; pulse?: boolean }) {
  const cfg = statusConfig[status]
  return (
    <span className="relative flex size-2.5">
      {pulse ? (
        <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", cfg.dot)} />
      ) : null}
      <span className={cn("relative inline-flex size-2.5 rounded-full", cfg.dot)} />
    </span>
  )
}
