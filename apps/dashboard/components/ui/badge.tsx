/**
 * Badge & SeverityBadge Components
 * 
 * Renders small status indicators / labels with semantic styles.
 * Uses cva for variant and style customization.
 * 
 * Usage example:
 * ```tsx
 * <Badge variant="success">Completed</Badge>
 * <SeverityBadge severity="high" />
 * ```
 */

import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold shrink-0 border transition-colors duration-200",
  {
    variants: {
      variant: {
        success: "bg-success-soft text-success border-success/10",
        warning: "bg-warning-soft text-warning-foreground border-warning/10",
        danger: "bg-danger-soft text-danger border-danger/10",
        primary: "bg-primary-soft text-primary border-primary/10",
        secondary: "bg-secondary text-secondary-foreground border-border",
        processing: "bg-processing-soft text-processing border-processing/10",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Badge Component
 * 
 * Standard badge component with style variants.
 * 
 * Usage example:
 * ```tsx
 * <Badge variant="success">Verified</Badge>
 * ```
 */
export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  )
}

/**
 * SeverityBadge Component
 * 
 * Specialized badge indicating task severity level.
 * 
 * Usage example:
 * ```tsx
 * <SeverityBadge severity="Critical" />
 * ```
 */
export function SeverityBadge({
  severity,
  className,
}: {
  severity: "Critical" | "High" | "Medium" | "Low"
  className?: string
}) {
  const map = {
    Critical: "danger",
    High: "danger",
    Medium: "warning",
    Low: "secondary",
  } as const

  return (
    <Badge
      variant={map[severity]}
      className={cn("rounded-full font-semibold text-3xs tracking-wide uppercase px-2 py-0.5", className)}
    >
      {severity}
    </Badge>
  )
}
