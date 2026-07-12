"use client"

import { useState, useEffect } from "react"
import { ShieldAlert, CheckCircle, ChevronDown, Activity } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { ExecutionStepperCard } from "@/components/shared/execution-stepper"
import { Card } from "@/components/ui/card"
import { StatusPill } from "@/components/ui/status"
import { SeverityBadge } from "@/components/ui/badge"
import { PageHeader } from "@/components/ui/page-header"
import { mapApiIncidentToDashboardIncident } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useStream } from "@/lib/stream-context"

export default function IncidentsPage() {
  const [activeCategory, setActiveCategory] = useState<string>("all")
  const [expandedIncident, setExpandedIncident] = useState<string | null>(null)
  const { incidentsList, refetch: fetchIncidents } = useStream()

  const categories = ["all", "Plugin conflict", "Security", "Performance", "Uptime", "Checkout", "Fatal error"]

  const filteredIncidents = incidentsList.filter((inc) => {
    if (activeCategory === "all") return true
    return inc.category.toLowerCase() === activeCategory.toLowerCase()
  })

  const resolvedIncidents = filteredIncidents.filter((inc) => inc.stage === "resolved")
  const activeList = filteredIncidents.filter((inc) => inc.stage !== "resolved")

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Incidents"
          subtitle="Complete history of issues SyntaxWP has diagnosed, resolved, or flagged for your approval."
          category="SYSTEM LOGS"
          icon={Activity}
          tabs={[
            { id: "all", label: "All categories" },
            { id: "Plugin conflict", label: "Plugin conflict" },
            { id: "Security", label: "Security" },
            { id: "Performance", label: "Performance" },
            { id: "Uptime", label: "Uptime" },
            { id: "Checkout", label: "Checkout" },
            { id: "Fatal error", label: "Fatal error" },
          ]}
          activeTab={activeCategory}
          onTabChange={setActiveCategory}
        />

        {/* Active Incidents */}
        {activeList.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-danger text-white text-xs font-bold">
                {activeList.length}
              </span>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Needs your OK
              </h2>
            </div>
            {activeList.map((inc) => (
              <ExecutionStepperCard 
                key={inc.id} 
                incident={inc} 
                onActionComplete={fetchIncidents}
              />
            ))}
          </section>
        )}

        {/* Resolved Incidents */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Resolved Timeline
            </h2>
          </div>

          <div className="space-y-3">
            {resolvedIncidents.length === 0 ? (
              <Card>
                <div className="p-8 text-center text-muted-foreground">
                  No resolved incidents found matching this filter.
                </div>
              </Card>
            ) : (
              resolvedIncidents.map((inc) => {
                const isExpanded = expandedIncident === inc.id
                return (
                  <div
                    key={inc.id}
                    className="overflow-hidden rounded-3xl border border-border bg-card shadow-xs transition-all"
                  >
                    {/* Header Row */}
                    <div
                      onClick={() => setExpandedIncident(isExpanded ? null : inc.id)}
                      className="flex cursor-pointer items-center justify-between gap-4 p-5 hover:bg-muted/20"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                          <CheckCircle className="size-4.5" />
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-sm">{inc.title}</h3>
                            <span className="text-xs font-medium text-muted-foreground">({inc.id.slice(0, 8)})</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {inc.subtitle}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <SeverityBadge severity={inc.risk === "Low" ? "Low" : "Medium"} />
                        <StatusPill status="healthy" label={inc.category} />
                        <ChevronDown
                          className={cn("size-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")}
                        />
                      </div>
                    </div>

                    {/* Collapsible Details */}
                    {isExpanded && (
                      <div className="border-t border-border bg-muted/10 p-5">
                        <ExecutionStepperCard incident={inc} hideHeader={true} />
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
