import { cn } from "@/lib/utils"

function toneForScore(score: number) {
  if (score >= 85) return { stroke: "var(--success)", label: "Excellent", text: "text-success" }
  if (score >= 65) return { stroke: "var(--warning)", label: "Good", text: "text-warning-foreground" }
  return { stroke: "var(--danger)", label: "Needs care", text: "text-danger" }
}

export function HealthDial({
  score,
  size = 200,
  label = "Health score",
  showLabel = true,
  className,
}: {
  score: number
  size?: number
  label?: string
  showLabel?: boolean
  className?: string
}) {
  const stroke = size * 0.09
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dash = (score / 100) * circumference
  const tone = toneForScore(score)

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-4xl font-semibold tracking-tight tabular-nums">{score}</span>
        {showLabel ? (
          <>
            <span className={cn("text-sm font-medium", tone.text)}>{tone.label}</span>
            <span className="mt-0.5 text-xs-compact text-muted-foreground">{label}</span>
          </>
        ) : null}
      </div>
    </div>
  )
}
