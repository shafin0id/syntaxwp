/**
 * Charts Components
 * 
 * Includes Sparkline, MiniBars, Meter, and StatCard components for dashboard data visualisations.
 */
import { cn } from "@/lib/utils"
import { ArrowUpRight, ArrowDownRight, Minus, type LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"

/* ---------- Sparkline (area) ---------- */

export function Sparkline({
  data,
  color = "var(--primary)",
  height = 56,
  className,
  invert = false,
}: {
  data: number[]
  color?: string
  height?: number
  className?: string
  invert?: boolean
}) {
  const width = 240
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const step = width / (data.length - 1)
  const points = data.map((d, i) => {
    const norm = (d - min) / range
    const y = invert ? norm * (height - 8) + 4 : height - (norm * (height - 8) + 4)
    return [i * step, y] as const
  })
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ")
  const area = `${line} L ${width} ${height} L 0 ${height} Z`
  const id = `spark-${Math.round(color.length * 97 + data.length)}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      style={{ height }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ---------- Bars ---------- */

export function MiniBars({
  data,
  color = "var(--primary)",
  height = 64,
  className,
}: {
  data: number[]
  color?: string
  height?: number
  className?: string
}) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  return (
    <div className={cn("flex items-end gap-1", className)} style={{ height }}>
      {data.map((d, i) => {
        const h = 12 + ((d - min) / (max - min || 1)) * (height - 12)
        return (
          <div
            key={i}
            className="flex-1 rounded-t-sm transition-all"
            style={{ height: h, backgroundColor: color, opacity: 0.35 + (d / max) * 0.65 }}
          />
        )
      })}
    </div>
  )
}

/* ---------- Progress meter ---------- */

export function Meter({ value, tone = "success" }: { value: number; tone?: "success" | "warning" | "danger" | "primary" | "info" }) {
  const bg = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    primary: "bg-primary",
    info: "bg-info",
  }[tone]
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-all", bg)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  )
}

/* ---------- Stat card ---------- */

export function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  trend,
  trendLabel,
  tone = "primary",
}: {
  label: string
  value: string
  caption?: string
  icon?: LucideIcon
  trend?: "up" | "down" | "flat"
  trendLabel?: string
  tone?: "primary" | "success" | "info" | "warning"
}) {
  const toneBg = {
    primary: "bg-accent text-primary",
    success: "bg-success-soft text-success",
    info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning-foreground",
  }[tone]
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus
  return (
    <Card rounded="3xl" className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn("flex size-8 items-center justify-center rounded-lg", toneBg)}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-mono text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {trend ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium",
              trend === "down" ? "text-danger" : "text-success",
            )}
          >
            <TrendIcon className="size-3.5" />
            {trendLabel}
          </span>
        ) : null}
        {caption ? <span className="text-xs text-muted-foreground">{caption}</span> : null}
      </div>
    </Card>
  )
}
