import * as React from "react"
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { type LucideIcon } from "lucide-react"
import { cn } from '@/lib/utils'

/**
 * Button Component
 * 
 * Standardized button component built on top of `@base-ui/react/button`.
 * Supports several variants, sizes, and an animated icon suffix wrapper.
 * 
 * Usage example:
 * ```tsx
 * <Button variant="primary" icon={ArrowRight}>
 *   Continue
 * </Button>
 * ```
 */

const buttonVariants = cva(
  "group inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-98 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        primary: 
          "bg-primary border-primary text-primary-foreground hover:bg-primary-hover hover:border-primary-hover active:bg-primary-active active:border-primary-active shadow-sm",
        "primary-inverted": 
          "bg-white border-white text-primary hover:bg-primary-soft-hover hover:border-primary-soft-hover active:bg-primary-soft-active active:border-primary-soft-active shadow-sm",
        secondary: 
          "bg-secondary-bg border-secondary-border text-charcoal hover:bg-primary-soft-hover hover:border-primary hover:text-primary active:bg-primary-soft-active active:border-primary active:text-primary shadow-xs",
        outline:
          "bg-transparent border-primary text-primary hover:bg-primary/5",
        ghost:
          "bg-transparent border-transparent text-foreground hover:bg-muted",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: 
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 text-xs",
        xs: 
          "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 
          "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        md:
          "h-10 gap-3 px-4 rounded-lg text-xs font-bold",
        lg: 
          "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: 
          "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": 
          "size-9",
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends ButtonPrimitive.Props,
    VariantProps<typeof buttonVariants> {
  icon?: LucideIcon
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'default', children, icon: Icon, ...props }, ref) => {
    // Determine the icon container colors based on button variant
    const getIconContainerClass = () => {
      if (variant === "primary") {
        return "bg-white text-primary"
      }
      if (variant === "primary-inverted") {
        return "bg-primary text-white transition-colors duration-200 group-hover:bg-primary-hover group-active:bg-primary-active"
      }
      if (variant === "secondary") {
        return "bg-track text-charcoal transition-colors duration-200 group-hover:bg-white group-hover:text-primary group-active:bg-white group-active:text-primary"
      }
      return "bg-muted text-foreground"
    }

    return (
      <ButtonPrimitive
        data-slot="button"
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        <span className="transition-transform duration-200 group-hover:-translate-y-[0.5px] inline-block">
          {children}
        </span>
        {Icon && (variant === "primary" || variant === "primary-inverted" || variant === "secondary") && (
          <span className={cn("relative flex size-6 shrink-0 items-center justify-center rounded-md overflow-hidden", getIconContainerClass())}>
            <Icon className="size-3.5 transition-transform duration-300 ease-out group-hover:translate-x-6" />
            <Icon className="size-3.5 absolute -translate-x-6 transition-transform duration-300 ease-out group-hover:translate-x-0" />
          </span>
        )}
        {Icon && !(variant === "primary" || variant === "primary-inverted" || variant === "secondary") && (
          <Icon className="size-3.5" />
        )}
      </ButtonPrimitive>
    )
  }
)

Button.displayName = "Button"

export { Button, buttonVariants }
