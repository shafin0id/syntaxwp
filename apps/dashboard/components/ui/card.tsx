import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import { type LucideIcon } from "lucide-react"

/**
 * Card Component
 * 
 * A container component for grouping related content.
 * Supports different layout shapes (border radius) and interactivity styles.
 * 
 * Usage example:
 * ```tsx
 * <Card variant="interactive" rounded="3xl">
 *   <CardHeader title="My Card" description="Card details" icon={Shield} />
 *   <div className="p-5">Content</div>
 * </Card>
 * ```
 */

const cardVariants = cva(
  "border border-border bg-card text-card-foreground shadow-xs overflow-hidden transition-all duration-300",
  {
    variants: {
      variant: {
        default: "",
        interactive: "hover:border-primary/20 hover:shadow-sm",
      },
      rounded: {
        xl: "rounded-xl",
        "3xl": "rounded-3xl",
      },
    },
    defaultVariants: {
      variant: "default",
      rounded: "xl",
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  children: React.ReactNode
}

export function Card({ className, variant, rounded, children, ...props }: CardProps) {
  return (
    <div className={cn(cardVariants({ variant, rounded, className }))} {...props}>
      {children}
    </div>
  )
}

/**
 * CardHeader Component
 * 
 * A standardized header for cards containing an optional icon, title, description, and action button.
 */
export function CardHeader({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-border px-5 py-4", className)}>
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Icon className="size-4.5" />
          </span>
        ) : null}
        <div>
          <h3 className="text-sm font-semibold leading-tight text-balance">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{description}</p>
          ) : null}
        </div>
      </div>
      {action}
    </div>
  )
}
