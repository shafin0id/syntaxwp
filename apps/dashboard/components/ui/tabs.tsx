"use client"

import { cn } from "@/lib/utils"

interface TabOption {
  id: string
  label: string
}

interface TabsProps {
  tabs: TabOption[]
  activeTab: string
  onChange: (id: string) => void
  className?: string
}

/**
 * Tabs Component
 * 
 * Standard navigation tab strip component.
 * 
 * Usage example:
 * ```tsx
 * <Tabs
 *   tabs={[{ id: "tab1", label: "Tab 1" }, { id: "tab2", label: "Tab 2" }]}
 *   activeTab={activeTab}
 *   onChange={setActiveTab}
 * />
 * ```
 */
export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div className={cn("border-b border-border", className)}>
      <nav className="-mb-px flex space-x-6" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                "border-b-2 px-1 pb-3 text-sm font-medium transition-colors outline-none cursor-pointer",
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
  )
}
