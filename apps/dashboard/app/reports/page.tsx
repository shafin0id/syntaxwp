"use client"

import { useState, useEffect } from "react"
import { FileText, ArrowDownToLine, Eye, Calendar, Sparkles, Loader2, ShieldCheck, Check } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Card, CardHeader } from "@/components/ui/card"
import { StatusPill } from "@/components/ui/status"
import { PageHeader } from "@/components/ui/page-header"
import { Modal } from "@/components/ui/modal"
import { cn } from "@/lib/utils"

export default function ReportsPage() {
  const [reports, setReports] = useState<any[]>([])
  const [generatingReport, setGeneratingReport] = useState(false)
  const [selectedReport, setSelectedReport] = useState<any | null>(null)

  useEffect(() => {
    fetch("http://localhost:4000/api/reports")
      .then((r) => r.json())
      .then((data) => setReports(data))
      .catch(console.error);
  }, []);

  const triggerGenerateReport = () => {
    setGeneratingReport(true)
    setTimeout(() => {
      const newReport = {
        id: `r-${Date.now()}`,
        title: "July 2025 · Monthly health report",
        period: "Jul 1 – Jul 31",
        issues: 0,
        uptime: "100.00%",
        ready: true,
      }
      setReports((prev) => [newReport, ...prev])
      setGeneratingReport(false)
    }, 2000)
  }

  const downloadReportPdf = (title: string) => {
    alert(`Generating PDF download for: "${title}". PDF compiled with standard WooCommerce billing/health telemetry template.`)
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Monthly Health Reports"
          subtitle="Comprehensive summaries of site uptime, resolved issues, security audit logs, and shop metrics."
          category="ANALYTICS & REPORTS"
          icon={FileText}
          actions={
            <button
              disabled={generatingReport}
              onClick={triggerGenerateReport}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-4.5 rounded-lg text-xs font-bold bg-primary border border-primary text-primary-foreground hover:bg-primary-hover hover:border-primary-hover active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              {generatingReport ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Compiling Report...
                </>
              ) : (
                <>
                  <FileText className="size-3.5" />
                  Generate current report
                </>
              )}
            </button>
          }
        />

        {/* Header Actions */}
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Report archives</h2>
        </div>

        {/* Reports Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reports.map((rep) => (
            <Card key={rep.id} className="flex flex-col justify-between p-5 hover:border-primary/20 transition-all">
              <div className="space-y-3">
                <span className="inline-flex size-9 items-center justify-center rounded-xl bg-accent text-primary">
                  <FileText className="size-4.5" />
                </span>
                <div>
                  <h3 className="font-semibold text-sm text-foreground">{rep.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{rep.period}</p>
                </div>

                <div className="divide-y divide-border border-t border-b border-border/80 my-3 py-1.5 text-xs">
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Uptime</span>
                    <span className="font-semibold font-mono text-success">{rep.uptime}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Issues Resolved</span>
                    <span className="font-semibold">{rep.issues} items</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 pt-2">
                <button
                  onClick={() => setSelectedReport(rep)}
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-border py-1.5 text-xs font-semibold hover:bg-muted transition-all cursor-pointer"
                >
                  <Eye className="size-3.5" />
                  View Details
                </button>
                <button
                  onClick={() => downloadReportPdf(rep.title)}
                  className="rounded-lg border border-border p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                  aria-label="Download PDF"
                >
                  <ArrowDownToLine className="size-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Report details Viewer Modal */}
      <Modal isOpen={selectedReport !== null} onClose={() => setSelectedReport(null)} title="Monthly Health Analysis">
        {selectedReport && (
          <div className="space-y-5">
            <div>
              <span className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">Report Period</span>
              <h4 className="font-bold text-sm text-foreground mt-1">{selectedReport.title}</h4>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedReport.period}</p>
            </div>

            {/* Stats block */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-muted/30 border border-border p-3 text-center">
                <span className="text-3xs uppercase tracking-wide text-muted-foreground block">Uptime</span>
                <span className="font-mono text-sm font-bold text-success block mt-1">{selectedReport.uptime}</span>
              </div>
              <div className="rounded-xl bg-muted/30 border border-border p-3 text-center">
                <span className="text-3xs uppercase tracking-wide text-muted-foreground block">Fixed Issues</span>
                <span className="text-sm font-bold text-foreground block mt-1">{selectedReport.issues}</span>
              </div>
              <div className="rounded-xl bg-muted/30 border border-border p-3 text-center">
                <span className="text-3xs uppercase tracking-wide text-muted-foreground block">Protected</span>
                <span className="text-xs font-bold text-primary block mt-1">$14,280</span>
              </div>
            </div>

            {/* Resolved incidents logs summary */}
            <div className="space-y-3">
              <span className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold block">Incident logs recorded</span>
              <div className="space-y-2.5 max-h-180px overflow-y-auto pr-1">
                {[
                  { title: "Checkout Pro incompatible version update rollback", type: "Checkout conflict", risk: "Low" },
                  { title: "Core WP updates compatibility staging test approved", type: "Security patch", risk: "Medium" },
                  { title: "Host provider maintenance outage recovery verification", type: "Outage monitor", risk: "Low" },
                ].map((log, idx) => (
                  <div key={idx} className="flex justify-between items-start rounded-lg border border-border bg-card px-3 py-2 text-xs">
                    <div>
                      <span className="font-semibold block text-foreground leading-snug">{log.title}</span>
                      <span className="text-muted-foreground text-2xs mt-0.5 block">{log.type}</span>
                    </div>
                    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-3xs font-semibold text-secondary-foreground uppercase">
                      {log.risk}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Download Action Footer */}
            <div className="pt-2">
              <button
                onClick={() => downloadReportPdf(selectedReport.title)}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all cursor-pointer"
              >
                <ArrowDownToLine className="size-4" />
                Download Complete PDF Report
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  )
}
