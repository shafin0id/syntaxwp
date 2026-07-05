"use client"

import { type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface TabOption {
  id: string
  label: string
}

interface PageHeaderProps {
  title: string
  subtitle?: string | React.ReactNode
  category?: string
  icon?: LucideIcon
  actions?: React.ReactNode
  tabs?: TabOption[]
  activeTab?: string
  onTabChange?: (id: string) => void
  className?: string
}

/**
 * PageHeader Component
 * 
 * Standard page-level header rendering a title, optional category badge, actions slot, and tab navigation.
 * 
 * Usage example:
 * ```tsx
 * <PageHeader
 *   title="Dashboard Settings"
 *   subtitle="Manage your preferences"
 *   category="System"
 *   icon={SettingsIcon}
 * />
 * ```
 */
export function PageHeader({
  title,
  subtitle,
  category,
  icon: Icon,
  actions,
  tabs,
  activeTab,
  onTabChange,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-4 mb-6", className)}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1">
          {category && (
            <div className="flex items-center gap-1.5 font-mono text-3xs tracking-widest text-primary font-bold uppercase">
              {Icon && <Icon className="size-3 text-primary" />}
              <span>{category}</span>
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl-compact leading-tight">
            {title}
          </h1>
          {subtitle && (
            <div className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              {subtitle}
            </div>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0 sm:self-start pt-1">
            {actions}
          </div>
        )}
      </div>

      {tabs && tabs.length > 0 && onTabChange && (
        <div className="border-b border-border pt-1">
          <nav className="-mb-px flex space-x-6 overflow-x-auto scrollbar-none" aria-label="Tabs">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    "border-b-2 px-1 pb-3 text-xs md:text-sm font-semibold transition-all duration-200 outline-none cursor-pointer whitespace-nowrap",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      )}

      {(!tabs || tabs.length === 0) && (
        <div className="border-b border-border/60" />
      )}
    </div>
  )
}
