/**
 * ExecutionStepperCard Component
 * 
 * Renders an interactive multi-step process for resolving an incident.
 * Supports "overview" (compact card layout) and "detail" (expanded grid split-pane layout) variants.
 * Orchestrates step progression states (done, current, upcoming) and safety rollbacks.
 */

"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Check,
  Loader2,
  Circle,
  ShieldCheck,
  RotateCcw,
  X,
  Sparkles,
  ArrowRight,
} from "lucide-react"
export type StepState = "done" | "current" | "upcoming"
export type IncidentStep = {
  label: string
  detail?: string
  time?: string
  state: StepState
}
export type Incident = {
  id: string
  title: string
  subtitle: string
  category: string
  status: string
  stage: string
  detectedAgo: string
  fix: string
  risk: string
  reversible: string
  steps: IncidentStep[]
  evidence: { label: string; value: string }[]
}
import { cn } from "@/lib/utils"
import { StatusPill } from "@/components/ui/status"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useStream } from "@/lib/stream-context"

type Phase = "awaiting" | "deploying" | "resolved" | "declined" | "restoring"

export function ExecutionStepperCard({
  incident,
  variant = "detail",
  hideHeader = false,
  onActionComplete,
}: {
  incident: Incident
  variant?: "detail" | "overview"
  hideHeader?: boolean
  onActionComplete?: () => void
}) {
  const isAwaiting = incident.stage === "awaiting-approval"
  const [phase, setPhase] = useState<Phase>(incident.stage === "resolved" ? "resolved" : "awaiting")
  const [activeTab, setActiveTab] = useState<"progress" | "evidence">("progress")

  const { auditLogs } = useStream()

  // Server state is authoritative: approval only starts deployment.
  useEffect(() => {
    setPhase(incident.stage === "resolved" ? "resolved" : incident.stage === "awaiting-approval" ? "awaiting" : "deploying")
  }, [incident.stage])

  // Filter logs for this incident
  const logs = auditLogs.filter((log) => log.incidentId === incident.id)

  // Compute live step states
  const steps: IncidentStep[] = incident.steps.map((s) => ({ ...s }))
  
  if (incident.stage !== "resolved" && logs.length > 0) {
    for (const log of logs) {
      if (log.eventType === "state_transition") {
        steps[0] = { label: "Issue spotted", detail: log.summary, state: "done" as const }
        steps[1] = { label: "Root cause found", state: "current" as const }
      } else if (log.eventType === "diagnostic_complete") {
        steps[1] = { label: "Root cause found", detail: log.summary, state: "done" as const }
        steps[2] = { label: "Testing fix", state: "current" as const }
      } else if (log.eventType === "staging_check_failed") {
        steps[0] = { label: "Issue spotted", state: "done" as const }
        steps[1] = { label: "Root cause found", detail: "Diagnostics complete", state: "done" as const }
        steps[2] = { label: "Testing fix", detail: log.summary, state: "done" as const }
      } else if (log.eventType === "fix_applied") {
        steps[2] = { label: "Testing fix", state: "done" as const }
        steps[3] = { label: "Promote fix", detail: log.summary, state: "done" as const }
      }
    }
  }

  // Override step 3 if approved/declined locally during transition
  if (isAwaiting) {
    if (phase === "deploying") {
      steps[3] = { ...steps[3], state: "current" as const, detail: "Applying approved fix..." }
    } else if (phase === "resolved") {
      steps[3] = { ...steps[3], state: "done" as const, detail: "You approved the fix — nicely done!" }
    } else if (phase === "declined") {
      steps[3] = { ...steps[3], state: "done" as const, detail: "You declined — nothing was changed" }
    }
  }

  const isCritical = incident.status === "critical"

  const borderClass = phase === "resolved"
    ? "border-success/40"
    : phase === "declined"
      ? "border-border"
      : isCritical
        ? "border-danger/40"
        : "border-warning/40"

  const bannerBgClass = phase === "resolved"
    ? "bg-success-soft"
    : phase === "declined"
      ? "bg-muted"
      : isCritical
        ? "bg-danger-soft"
        : "bg-warning-soft"

  const iconBgClass = phase === "resolved"
    ? "bg-success text-white"
    : isCritical
      ? "bg-danger text-white"
      : "bg-warning text-white"

  const pillStatus = phase === "resolved"
    ? "healthy"
    : isCritical
      ? "critical"
      : "warning"

  // Unified High-Contrast Risk Badge
  const isLowRisk = incident.risk.toLowerCase() === "low"
  const riskVariant: "success" | "warning" | "danger" = 
    incident.risk.toLowerCase() === "low"
      ? "success"
      : incident.risk.toLowerCase() === "medium"
        ? "warning"
        : "danger"

  const reversibleVariant: "success" | "secondary" = 
    incident.reversible === "Yes, instantly"
      ? "success"
      : "secondary"

  const riskLabel = isLowRisk ? "Low Risk Fix" : `${incident.risk} Risk`
  const reversibleLabel = incident.reversible === "Yes, instantly"
    ? "Instantly reversible"
    : incident.reversible

  const successMsg = incident.category === "Fatal error"
    ? "All done — file integrity restored."
    : isCritical
      ? "All done — database repaired."
      : "All done — store is healthy."

  /* -------------------------------------------------------------
     VARIANT: OVERVIEW (Ultra-Compact action card for Homepage)
     ------------------------------------------------------------- */
  if (variant === "overview") {
    return (
      <Card
        rounded="3xl"
        className={cn(
          "overflow-hidden transition-colors duration-300",
          borderClass
        )}
      >
        {/* Header - Compact single-row */}
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-5 py-2.5 border-b border-border/10",
            bannerBgClass
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg shadow-xs",
                iconBgClass
              )}
            >
              {phase === "resolved" ? <Check className="size-4" /> : <ShieldCheck className="size-4" />}
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-x-2">
                <h3 className="text-sm font-semibold truncate leading-none">
                  {phase === "resolved" ? "Fixed — store is healthy" : incident.title}
                </h3>
                <span className="text-2xs font-mono font-medium text-muted-foreground/80 leading-none">({incident.id})</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill status={pillStatus} />
          </div>
        </div>

        {/* Content - Compact layout */}
        <div className="p-4 space-y-3.5">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            {/* Left: Fix description and safety badge */}
            <div className="flex-1 min-w-0 space-y-2.5">
              <p className="text-xs md:text-sm text-muted-foreground text-pretty leading-relaxed">
                {phase === "resolved"
                  ? "The rollback has been successfully completed, and your live site is verified healthy."
                  : incident.fix}
              </p>

              {/* High contrast risk highlights using reusable Badge components */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant={riskVariant}>{riskLabel}</Badge>
                <Badge variant={reversibleVariant}>{reversibleLabel}</Badge>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="shrink-0 flex flex-col justify-center min-w-200px gap-2 pt-1 md:pt-0">
              {phase === "awaiting" && (
                <div className="flex flex-col gap-1.5 w-full">
                  <Button
                    disabled={!isAwaiting}
                    onClick={async () => {
                      setPhase("deploying")
                      try {
                        const res = await fetch(`http://localhost:4000/api/incidents/${incident.id}/approve`, {
                          method: "POST"
                        });
                        if (res.ok) {
                          if (onActionComplete) onActionComplete()
                        } else {
                          setPhase("awaiting")
                          alert("Approval failed on backend.")
                        }
                      } catch (err) {
                        setPhase("awaiting")
                        alert("Error contacting api server.")
                      }
                    }}
                    className="w-full justify-between text-xs font-semibold px-4 h-10 min-w-145px"
                    icon={Check}
                  >
                    Approve this fix
                  </Button>
                  <Button
                    disabled={!isAwaiting}
                    onClick={() => setPhase("declined")}
                    variant="secondary"
                    className="w-full justify-between text-xs font-semibold px-4 h-10 min-w-145px"
                    icon={X}
                  >
                    Not now
                  </Button>
                  {!isAwaiting && (
                    <div className="flex items-center gap-1.5 text-3xs font-medium text-muted-foreground mt-1 justify-center animate-pulse">
                      <Loader2 className="size-3 animate-spin text-primary" />
                      <span>{incident.stage === "diagnosing" ? "Diagnosing conflict..." : "Running staging checks..."}</span>
                    </div>
                  )}
                </div>
              )}

              {phase === "deploying" && (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-xs font-semibold text-primary">
                  <Loader2 className="size-4 animate-spin" />
                  Applying fix...
                </div>
              )}

              {phase === "resolved" && (
                <div className="flex flex-col gap-1.5 items-end">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
                    <Check className="size-4 shrink-0" />
                    <span>Fixed safely</span>
                  </div>
                  <button
                    onClick={async () => {
                      setPhase("restoring")
                      try {
                        const res = await fetch(`http://localhost:4000/api/incidents/${incident.id}/rollback`, {
                          method: "POST"
                        });
                        if (res.ok) {
                          setPhase("awaiting")
                          if (onActionComplete) onActionComplete()
                        } else {
                          setPhase("resolved")
                          alert("Rollback failed on backend.")
                        }
                      } catch (err) {
                        setPhase("resolved")
                        alert("Error contacting api server.")
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-success/20 bg-white text-success text-2xs font-bold hover:bg-success-soft active:scale-95 transition-all cursor-pointer shadow-2xs shrink-0"
                  >
                    <RotateCcw className="size-3" />
                    Restore changes
                  </button>
                </div>
              )}

              {phase === "restoring" && (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-xs font-semibold text-primary">
                  <Loader2 className="size-4 animate-spin" />
                  Restoring...
                </div>
              )}

              {phase === "declined" && (
                <div className="flex flex-col gap-1.5 items-end">
                  <p className="text-2xs text-muted-foreground text-right">
                    No changes made.
                  </p>
                  <button
                    onClick={() => setPhase("awaiting")}
                    className="text-xs-compact font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Reconsider
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Simple footer with restore point + view details link */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-border/40 pt-2.5 text-xs-compact">
            <div className="flex items-center gap-1.5 text-muted-foreground/80">
              <RotateCcw className="size-3.5 text-muted-foreground/60" />
              Restore point is ready · Undo instantly if needed
            </div>
            <Link
              href="/incidents"
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline cursor-pointer group"
            >
              See what happened
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </Card>
    )
  }

  /* -------------------------------------------------------------
     VARIANT: DETAIL (Full-fidelity card for Incidents Page)
     ------------------------------------------------------------- */
  return (
    <Card
      rounded="3xl"
      className={cn(
        "overflow-hidden transition-colors duration-300",
        borderClass
      )}
    >
      {/* Header Banner - Sleeker, compact single-row design */}
      {!hideHeader && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-5 py-3 border-b border-border/10",
            bannerBgClass
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={cn(
                "flex size-7.5 shrink-0 items-center justify-center rounded-lg shadow-xs",
                iconBgClass
              )}
            >
              {phase === "resolved" ? <Check className="size-4" /> : <ShieldCheck className="size-4" />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <h3 className="text-sm font-semibold truncate leading-none">
                  {phase === "resolved" ? "Fixed — your store is healthy" : incident.title}
                </h3>
                <span className="text-2xs font-mono font-medium text-muted-foreground/80">({incident.id})</span>
              </div>
              <p className="text-xs-compact text-muted-foreground/90 mt-0.5 truncate leading-none">
                {incident.category} · Detected {incident.detectedAgo}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill status={pillStatus} />
          </div>
        </div>
      )}

      <div className="p-4 md:p-5">
        <div className="flex flex-col lg:flex-row gap-5">
          {/* Left Column: Plan & Primary Actions */}
          <div className="flex-1 min-w-0 flex flex-col justify-between space-y-4">
            {/* Proposed Fix Block - stretches vertically to prevent shifts */}
            <div className="flex-1 flex flex-col justify-between rounded-2xl border border-border bg-background/45 p-4 shadow-2xs">
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="size-3.5 text-primary" />
                  <p className="text-2xs font-extrabold uppercase tracking-wider text-muted-foreground">Proposed Fix</p>
                </div>
                <p className="text-xs md:text-sm leading-relaxed text-muted-foreground text-pretty">
                  {phase === "resolved"
                    ? "The rollback has been successfully completed, and your live site is verified healthy."
                    : incident.fix}
                </p>
              </div>

              {/* High contrast risk Badge highlights using reusable Badge components */}
              <div className="flex flex-wrap items-center gap-2 mt-3.5">
                <Badge variant={riskVariant}>{riskLabel}</Badge>
                <Badge variant={reversibleVariant}>{reversibleLabel}</Badge>
              </div>
            </div>

            {/* Actions / Phase-specific components */}
            <div className="space-y-3">
              {phase === "awaiting" && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={async () => {
                      setPhase("deploying")
                      try {
                        const res = await fetch(`http://localhost:4000/api/incidents/${incident.id}/approve`, {
                          method: "POST"
                        })
                        if (res.ok) {
                          if (onActionComplete) onActionComplete()
                        } else {
                          setPhase("awaiting")
                          alert("Approval failed on backend.")
                        }
                      } catch {
                        setPhase("awaiting")
                        alert("Error contacting api server.")
                      }
                    }}
                    className="flex-1 justify-between text-xs font-semibold px-4 h-10 min-w-145px"
                    icon={Check}
                  >
                    Approve this fix
                  </Button>
                  <Button
                    onClick={() => setPhase("declined")}
                    variant="secondary"
                    className="flex-1 justify-between text-xs font-semibold px-4 h-10 min-w-145px"
                    icon={X}
                  >
                    Not now
                  </Button>
                </div>
              )}

              {phase === "deploying" && (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-2.5 text-xs font-semibold text-primary">
                  <Loader2 className="size-4 animate-spin" />
                  Applying your fix safely…
                </div>
              )}

              {phase === "resolved" && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-success-soft px-4 py-2.5 text-xs font-semibold text-success border border-success/10">
                  <div className="flex items-center gap-2">
                    <Check className="size-4 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                  <button
                    onClick={async () => {
                      setPhase("restoring")
                      try {
                        const res = await fetch(`http://localhost:4000/api/incidents/${incident.id}/rollback`, {
                          method: "POST"
                        });
                        if (res.ok) {
                          setPhase("awaiting")
                          if (onActionComplete) onActionComplete()
                        } else {
                          setPhase("resolved")
                          alert("Rollback failed on backend.")
                        }
                      } catch (err) {
                        setPhase("resolved")
                        alert("Error contacting api server.")
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-success/20 bg-white text-success text-2xs font-bold hover:bg-success-soft active:scale-95 transition-all cursor-pointer shadow-2xs shrink-0"
                  >
                    <RotateCcw className="size-3" />
                    Restore changes
                  </button>
                </div>
              )}

              {phase === "restoring" && (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-2.5 text-xs font-semibold text-primary animate-pulse">
                  <Loader2 className="size-4 animate-spin" />
                  Restoring backup safely…
                </div>
              )}

              {phase === "declined" && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
                  <p className="text-xs-compact text-muted-foreground">
                    No changes were made. We'll remind you later.
                  </p>
                  <button
                    onClick={() => setPhase("awaiting")}
                    className="text-xs-compact font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Reconsider
                  </button>
                </div>
              )}

              {/* Safety note (Only relevant when awaiting or deploying or declined) */}
              {phase !== "resolved" && phase !== "restoring" && (
                <div className="flex items-center justify-center gap-1.5 text-xs-compact text-muted-foreground/80">
                  <RotateCcw className="size-3.5 text-muted-foreground/60" />
                  Restore point is ready · Undo instantly if needed
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Tabbed Progress/Evidence */}
          <div className="lg:w-[42%] shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-border/80 pt-4 lg:pt-0 lg:pl-5 min-w-0">
            {/* Tabs Trigger Segmented Control - Softened Labels with Smooth Sliding Pill */}
            <div className="relative flex bg-muted/60 p-0.5 rounded-lg border border-border/40 w-full mb-3 shrink-0">
              <div
                className={cn(
                  "absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%_-_1px)] rounded-md bg-card border border-border/10 shadow-xs transition-transform duration-250 ease-out",
                  activeTab === "progress" ? "translate-x-0" : "translate-x-full"
                )}
              />
              <button
                onClick={() => setActiveTab("progress")}
                className={cn(
                  "relative z-10 flex-1 py-1 text-center text-xs font-semibold rounded-md transition-colors duration-200 cursor-pointer",
                  activeTab === "progress"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                What Happened
              </button>
              <button
                onClick={() => setActiveTab("evidence")}
                className={cn(
                  "relative z-10 flex-1 py-1 text-center text-xs font-semibold rounded-md transition-colors duration-200 cursor-pointer",
                  activeTab === "evidence"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Technical Proof
              </button>
            </div>

            {/* Tab content area - Fixed height to prevent layout shift & fast slide-fade entry */}
            <div 
              key={activeTab}
              className="flex-1 overflow-y-auto h-190px min-h-190px max-h-190px pr-1 scrollbar-thin animate-tab-content"
            >
              {activeTab === "progress" ? (
                <ol className="space-y-0.5 relative">
                  {steps.map((step, i) => (
                    <StepRow key={i} step={step} isLast={i === steps.length - 1} />
                  ))}
                </ol>
              ) : (
                <dl className="grid grid-cols-2 gap-2">
                  {incident.evidence.map((e) => (
                    <div key={e.label} className="flex flex-col bg-muted/25 rounded-xl p-2.5 border border-border/40">
                      <dt className="text-3xs font-extrabold uppercase tracking-wider text-muted-foreground/80">{e.label}</dt>
                      <dd className="text-xs font-semibold text-foreground mt-0.5 break-words">{e.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function StepRow({ step, isLast }: { step: IncidentStep; isLast: boolean }) {
  return (
    <li className="flex gap-2.5 group/step">
      {/* Marker + connector */}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border",
            step.state === "done" && "border-success bg-success text-white",
            step.state === "current" && "border-warning bg-warning-soft text-warning-foreground",
            step.state === "upcoming" && "border-border bg-background text-muted-foreground",
          )}
        >
          {step.state === "done" ? (
            <Check className="size-3 text-white" strokeWidth={3} />
          ) : step.state === "current" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Circle className="size-1.5 fill-current" />
          )}
        </span>
        {!isLast ? (
          <span className={cn("my-0.5 w-0.5 flex-1 min-h-3", step.state === "done" ? "bg-success/30" : "bg-border/60")} />
        ) : null}
      </div>

      {/* Content */}
      <div className={cn("min-w-0 flex-1 pb-2", isLast && "pb-0")}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p
            className={cn(
              "text-xs-compact font-semibold leading-tight",
              step.state === "upcoming" ? "text-muted-foreground/70" : "text-foreground",
            )}
          >
            {step.label}
          </p>
          {step.time ? (
            <span className="font-mono text-3xs text-muted-foreground/75 opacity-0 group-hover/step:opacity-100 transition-opacity duration-200">
              {step.time}
            </span>
          ) : null}
        </div>
        {step.detail ? (
          <p className="text-2xs leading-normal text-muted-foreground/90 text-pretty mt-0.5">{step.detail}</p>
        ) : null}
      </div>
    </li>
  )
}
