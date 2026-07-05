"use client"

import { useState } from "react"
import { Settings, ShieldCheck, Mail, Users, CreditCard, PlusCircle, Trash2, Send } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Toggle } from "@/components/ui/toggle"
import { Card, CardHeader } from "@/components/ui/card"
import { StatusPill } from "@/components/ui/status"
import { PageHeader } from "@/components/ui/page-header"
import { site, permissionSettings as initialPermissions, teamMembers as initialTeam, auditLog } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general")
  
  // States
  const [siteName, setSiteName] = useState(site.name)
  const [domain, setDomain] = useState(site.domain)
  const [permTier, setPermTier] = useState("some_access") // full_auto, some_access, manual
  const [permissions, setPermissions] = useState(initialPermissions)
  const [notificationEmail, setNotificationEmail] = useState("owner@greenleafbotanicals.com")
  const [slackWebhook, setSlackWebhook] = useState("https://hooks.slack.com/services/...")
  const [team, setTeam] = useState(initialTeam)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("Editor")
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const tabs = [
    { id: "general", label: "General" },
    { id: "permissions", label: "Permissions" },
    { id: "notifications", label: "Notifications" },
    { id: "team", label: "Team" },
    { id: "billing", label: "Billing" },
  ]

  const handlePermissionToggle = (id: string) => {
    setPermissions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    )
  }

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail) return
    const newMember = {
      id: `m-${Date.now()}`,
      name: inviteEmail.split("@")[0],
      email: inviteEmail,
      role: inviteRole,
      status: "pending",
    }
    setTeam((prev) => [...prev, newMember])
    setInviteEmail("")
  }

  const handleRemoveMember = (id: string) => {
    if (confirm("Are you sure you want to remove this team member?")) {
      setTeam((prev) => prev.filter((m) => m.id !== id))
    }
  }

  const testSlackNotification = () => {
    alert("Test notification webhook triggered. Payload: 'SyntaxWP checkout check verified successfully.' sent to Slack.")
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Settings"
          subtitle="Configure site keys, telemetry data permissions, team controls, and billing profiles."
          category="SYSTEM CONFIG"
          icon={Settings}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Tab: General */}
        {activeTab === "general" && (
          <div className="space-y-6">
            <Card>
              <CardHeader title="Site Identity" description="Basic WordPress installation configurations." icon={Settings} />
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">Site Name</label>
                    <input
                      type="text"
                      value={siteName}
                      onChange={(e) => setSiteName(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">Domain URL</label>
                    <input
                      type="text"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block">WP CORE</span>
                    <span className="font-semibold">{site.wpVersion}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">PHP RUNTIME</span>
                    <span className="font-semibold">{site.phpVersion}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">ACTIVE THEME</span>
                    <span className="font-semibold">{site.theme}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">MONITORED SINCE</span>
                    <span className="font-semibold">{site.monitoredSince}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Disconnect actions */}
            <Card className="border-danger/30 bg-danger-soft/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
                <div>
                  <h4 className="font-semibold text-sm text-danger">Danger Zone: Disconnect Website</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed text-pretty">
                    This stops all monitoring, checkout tests, and auto-security upgrades. The HMAC keys will be deleted.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (confirm("Type CONFIRM to disconnect site (This action is permanent).")) {
                      alert("Site connection deactivated. Redirecting to onboarding...")
                    }
                  }}
                  className="rounded-lg bg-destructive text-destructive-foreground px-4 py-2 text-xs font-semibold hover:bg-destructive/90 transition-all shrink-0 cursor-pointer"
                >
                  Disconnect site
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* Tab: Permissions */}
        {activeTab === "permissions" && (
          <div className="space-y-6">
            {/* Permission tier card selection */}
            <Card>
              <CardHeader title="Execution Permission Mode" description="Choose how much autonomy SyntaxWP has to fix staging/production errors." icon={ShieldCheck} />
              <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    id: "full_auto",
                    label: "Full Auto",
                    desc: "Apply staging-validated security and performance fixes. Zero downtime wait.",
                  },
                  {
                    id: "some_access",
                    label: "Some Access (Recommended)",
                    desc: "Auto-apply low risk patches; await checkout/plugin conflict approval.",
                  },
                  {
                    id: "manual",
                    label: "Manual Approval Only",
                    desc: "SyntaxWP will test staging fixes and always await your OK before applying.",
                  },
                ].map((tier) => (
                  <div
                    key={tier.id}
                    onClick={() => setPermTier(tier.id)}
                    className={cn(
                      "cursor-pointer border rounded-3xl p-4 transition-all hover:shadow-xs",
                      permTier === tier.id
                        ? "border-primary bg-primary-foreground/5 dark:bg-primary/5 shadow-inner"
                        : "border-border bg-card"
                    )}
                  >
                    <span className="font-semibold text-sm text-foreground block">{tier.label}</span>
                    <span className="text-xs text-muted-foreground block mt-1.5 leading-relaxed">{tier.desc}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Granular Permission Toggles */}
            <Card className="divide-y divide-border">
              <CardHeader title="Granular Operations Whitelist" description="Control individual capability settings." />
              {permissions.map((perm) => (
                <div key={perm.id} className="flex items-start justify-between gap-4 p-5">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{perm.label}</span>
                      {perm.recommended && <StatusPill status="healthy" label="Rec" />}
                    </div>
                    <p className="text-xs text-muted-foreground max-w-xl text-pretty leading-relaxed">
                      {perm.description}
                    </p>
                  </div>
                  <Toggle checked={perm.enabled} onChange={() => handlePermissionToggle(perm.id)} />
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Tab: Notifications */}
        {activeTab === "notifications" && (
          <div className="space-y-6">
            <Card>
              <CardHeader title="Email Notification Settings" description="SyntaxWP only messages you for actions requiring human confirmation." icon={Mail} />
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">Notification Destination Email</label>
                  <input
                    type="email"
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                    className="mt-1 h-9 w-full md:w-80 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                  />
                </div>
              </div>
            </Card>

            {/* Slack integration */}
            <Card>
              <CardHeader title="Slack Integration" description="Post site diagnostics directly into internal operations channels." />
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">Slack Incoming Webhook URL</label>
                  <div className="flex flex-col sm:flex-row gap-2 mt-1">
                    <input
                      type="text"
                      value={slackWebhook}
                      onChange={(e) => setSlackWebhook(e.target.value)}
                      className="h-9 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                    />
                    <button
                      onClick={testSlackNotification}
                      className="h-9 rounded-lg border border-border px-3.5 text-xs font-semibold hover:bg-muted transition-all cursor-pointer"
                    >
                      Test Webhook
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Tab: Team */}
        {activeTab === "team" && (
          <div className="space-y-6">
            {/* Invite Form */}
            <Card>
              <CardHeader title="Invite New Member" description="Grant editors access to approve fixes or roll back restore points." icon={Users} />
              <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3 p-5">
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="h-9 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-card px-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                >
                  <option value="Editor">Editor</option>
                  <option value="Admin">Admin</option>
                </select>
                <button
                  type="submit"
                  className="flex items-center justify-center gap-1 h-9 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all cursor-pointer"
                >
                  <PlusCircle className="size-4" />
                  Invite member
                </button>
              </form>
            </Card>

            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-xs">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">Member</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">Role</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {team.map((member) => (
                    <tr key={member.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3.5 align-middle">
                        <span className="font-semibold text-foreground text-sm block">{member.name}</span>
                        <span className="text-xs-compact text-muted-foreground">{member.email}</span>
                      </td>
                      <td className="px-5 py-3.5 align-middle">
                        <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                          {member.role}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 align-middle text-right">
                        {member.role !== "Owner" && (
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger transition-colors cursor-pointer"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab: Billing */}
        {activeTab === "billing" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Plan card */}
              <Card>
                <CardHeader title="Guardian Protection Plan" description="SyntaxWP core server operations tier." icon={CreditCard} />
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xl font-bold text-foreground">Guardian Pro</span>
                    <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Includes 60-second multi-region uptime checks, visual regression staging sandbox, and 30-day snapshot rotations.
                  </p>
                  <div className="border-t border-border pt-4 flex justify-between items-center text-xs">
                    <div>
                      <span className="text-muted-foreground block">PRICE / RENEW DATE</span>
                      <span className="font-semibold">$79/mo · Renews Aug 1, 2026</span>
                    </div>
                    <button
                      onClick={() => alert("Upgrade/Downgrade pricing modal simulated.")}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-all cursor-pointer"
                    >
                      Change Plan
                    </button>
                  </div>
                </div>
              </Card>

              {/* Invoice list */}
              <Card>
                <CardHeader title="Invoice Logs" description="Past billing receipts." />
                <div className="divide-y divide-border">
                  {[
                    { date: "Jun 1, 2026", num: "INV-0842", amount: "$79.00" },
                    { date: "May 1, 2026", num: "INV-0720", amount: "$79.00" },
                    { date: "Apr 1, 2026", num: "INV-0604", amount: "$79.00" },
                  ].map((inv) => (
                    <div key={inv.num} className="flex justify-between items-center px-5 py-3.5 text-xs">
                      <div>
                        <span className="font-semibold block">{inv.num}</span>
                        <span className="text-muted-foreground block mt-0.5">{inv.date}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{inv.amount}</span>
                        <span className="text-success font-semibold flex items-center gap-1">
                          <span className="size-1 rounded-full bg-success" />
                          Paid
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
