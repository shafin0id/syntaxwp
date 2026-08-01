"use client"

import { apiFetch } from "@/lib/api-fetch"

import { useState, useEffect } from "react"
import { History, ShieldAlert, Check, Loader2, RotateCcw, AlertTriangle, ArrowRight, Eye, PlusCircle } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Card, CardHeader } from "@/components/ui/card"
import { StatusPill } from "@/components/ui/status"
import { PageHeader } from "@/components/ui/page-header"
import { Meter } from "@/components/shared/charts"
import { Modal } from "@/components/ui/modal"
import { cn } from "@/lib/utils"

export default function RestorePointsPage() {
  const [points, setPoints] = useState<any[]>([])
  const [creatingBackup, setCreatingBackup] = useState(false)

  // Modals state
  const [previewPoint, setPreviewPoint] = useState<any | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<any | null>(null)

  // Restore execution state
  const [restoreStep, setRestoreStep] = useState(0) // 0: not started, 1: in progress, 2: success
  const [restoreError, setRestoreError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch(`/api/restore-points`)
      .then((r) => r.json())
      .then((data) => setPoints(data))
      .catch(console.error);
  }, []);

  const triggerBackup = () => {
    setCreatingBackup(true)
    setTimeout(() => {
      const newPoint = {
        id: `rp-${Date.now()}`,
        label: "Manual backup (Dashboard trigger)",
        time: "Just now",
        type: "Manual",
        size: "141 MB",
        current: false,
      }
      setPoints((prev) => [newPoint, ...prev])
      setCreatingBackup(false)
    }, 2500)
  }

  const triggerRestore = async (point: any) => {
    setRestoreStep(1)
    setRestoreError(null)
    try {
      const res = await apiFetch(`/api/restore-points/${point.id}/revert`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRestoreError(data.error || "Restore failed.")
        setRestoreStep(0)
        return
      }
      setRestoreStep(2)
      setPoints((prev) => prev.map((p) => ({ ...p, current: p.id === point.id })))
    } catch {
      setRestoreError("Network error — could not reach the server.")
      setRestoreStep(0)
    }
  }

  const closeRestoreModal = () => {
    setRestoreTarget(null)
    setRestoreStep(0)
    setRestoreError(null)
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Restore Points"
          subtitle="Revert your site to any historical daily backup, core upgrade snapshot, or manual checkpoint."
          category="RECOVERY & SNAPSHOTS"
          icon={History}
          actions={
            <button
              disabled={creatingBackup}
              onClick={triggerBackup}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-4.5 rounded-lg text-xs font-bold bg-primary border border-primary text-primary-foreground hover:bg-primary-hover hover:border-primary-hover active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0 shadow-xs"
            >
              {creatingBackup ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Creating Snapshot...
                </>
              ) : (
                <>
                  <PlusCircle className="size-3.5" />
                  Create manual backup
                </>
              )}
            </button>
          }
        />

        {/* Storage stats */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="p-5 flex flex-col justify-center">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">RECOVERY POINTS</span>
            <span className="font-mono text-3xl font-bold text-foreground mt-2">{points.length} Snapshots</span>
            <span className="text-xs text-muted-foreground mt-1">Automatic nightly + manual checkpoints</span>
          </Card>

          <Card className="md:col-span-2 p-5 space-y-3">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-muted-foreground uppercase tracking-wider">Snapshot Storage Limit</span>
              <span className="font-mono">837 MB / 10 GB (free)</span>
            </div>
            <Meter value={(837 / 10240) * 100} tone="primary" />
            <p className="text-xs text-muted-foreground leading-relaxed pt-1">
              SyntaxWP stores up to 30 snapshots automatically. Older snapshots are rotated out to keep storage clean.
            </p>
          </Card>
        </div>

        {/* Timeline Header actions */}
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Restore Points Timeline</h2>
        </div>

        {/* Timeline List */}
        <div className="space-y-3">
          {points.map((pt) => (
            <div
              key={pt.id}
              className={cn(
                "flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border p-5 shadow-xs transition-all",
                pt.current
                  ? "border-primary/50 bg-primary-foreground/5 dark:bg-primary/5"
                  : "border-border bg-card"
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl",
                    pt.current
                      ? "bg-primary text-primary-foreground"
                      : "bg-accent text-accent-foreground"
                  )}
                >
                  <History className="size-4.5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-sm text-foreground">{pt.label}</h3>
                    {pt.current && (
                      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-semibold text-primary">
                        Current Point
                      </span>
                    )}
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-2xs font-semibold text-secondary-foreground">
                      {pt.type}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Created: {pt.time} · Size: {pt.size}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  onClick={() => setPreviewPoint(pt)}
                  className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-all cursor-pointer"
                >
                  <Eye className="size-3.5" />
                  Preview
                </button>
                <button
                  onClick={() => {
                    setRestoreTarget(pt)
                    setRestoreStep(0)
                  }}
                  className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all cursor-pointer"
                >
                  <RotateCcw className="size-3.5" />
                  Restore to this point
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview Modal */}
      <Modal isOpen={previewPoint !== null} onClose={() => setPreviewPoint(null)} title="Snapshot Preview">
        {previewPoint && (
          <div className="space-y-4">
            <div>
              <span className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">Snapshot Details</span>
              <h4 className="font-bold text-sm text-foreground mt-1">{previewPoint.label}</h4>
              <p className="text-xs text-muted-foreground mt-0.5">Created on {previewPoint.time}</p>
            </div>

            <div className="divide-y divide-border rounded-xl border border-border bg-card p-1 text-xs">
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Type</span>
                <span className="font-semibold">{previewPoint.type}</span>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Archive Size</span>
                <span className="font-semibold">{previewPoint.size}</span>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">WP Core Version</span>
                <span className="font-semibold">v7.0.1</span>
              </div>
            </div>

            <div>
              <span className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold block mb-2">Affected Plugins In Staged State</span>
              <div className="space-y-2 max-h-160px overflow-y-auto">
                {[
                  { name: "WooCommerce", version: "9.1.0", action: "No Change" },
                  { name: "Stripe Payments Pro", version: "4.1.9", action: "Downgraded from 4.2.1" },
                  { name: "WP Rocket", version: "3.15.1", action: "No Change" },
                ].map((plug, idx) => (
                  <div key={idx} className="flex justify-between items-center rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                    <div>
                      <span className="font-semibold block">{plug.name}</span>
                      <span className="text-muted-foreground text-2xs">v{plug.version}</span>
                    </div>
                    <span className="text-2xs font-semibold text-primary">{plug.action}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Restore Warning & Stepper Simulation Modal */}
      <Modal isOpen={restoreTarget !== null} onClose={closeRestoreModal} title="Revert to Restore Point">
        {restoreTarget && (
          <div className="space-y-4">
            {restoreStep === 0 && (
              <>
                <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4">
                  <AlertTriangle className="size-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-sm text-amber-700">Warning: Database & Files Reversion</h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed text-pretty">
                      Restoring to <strong>{restoreTarget.label}</strong> will roll back your WordPress database and active plugins list. Existing custom orders or posts created after this point will be updated or deleted.
                    </p>
                  </div>
                </div>

                {restoreError && (
                  <p className="text-xs font-semibold text-destructive">{restoreError}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={closeRestoreModal}
                    className="rounded-lg border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => triggerRestore(restoreTarget)}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all cursor-pointer"
                  >
                    <RotateCcw className="size-3.5" />
                    Confirm restore
                  </button>
                </div>
              </>
            )}

            {restoreStep === 1 && (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
                <Loader2 className="size-4.5 animate-spin" />
                Reverting...
              </div>
            )}

            {restoreStep === 2 && (
              <div className="space-y-4 text-center py-4">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success text-success-foreground">
                  <Check className="size-6" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-foreground mt-2">Restore Complete</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    The action tied to this restore point has been reverted on your site.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={closeRestoreModal}
                    className="rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all cursor-pointer"
                  >
                    Close Dialog
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AppShell>
  )
}
