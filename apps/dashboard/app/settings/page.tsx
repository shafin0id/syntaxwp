"use client"

import { useState, useEffect } from "react"
import { Settings, ShieldCheck, Mail, Users, CreditCard, PlusCircle, Trash2, Eye, EyeOff, Copy, Check, ChevronDown, ChevronUp, Lock } from "lucide-react"
import { AppShell } from "@/components/layout/app-shell"
import { Toggle } from "@/components/ui/toggle"
import { Card, CardHeader } from "@/components/ui/card"
import { StatusPill } from "@/components/ui/status"
import { PageHeader } from "@/components/ui/page-header"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type PermissionItem = {
  id: string
  label: string
  description: string
  group: string
  risk: "low" | "medium" | "high"
  action: string
  alwaysOn?: boolean
}

export const defaultPermissions: PermissionItem[] = [
  {
    id: "vuln-scan",
    label: "Vulnerability Scanning & Matching",
    description: "Actively monitor installed plugins and themes against known CVE databases.",
    group: "Security (Read-Only)",
    risk: "low",
    action: "vulnerability_scan",
    alwaysOn: true,
  },
  {
    id: "deactivate-plugin",
    label: "Auto-deactivate conflicting plugins",
    description: "Instantly deactivate isolated plugins causing white screens or page check failures.",
    group: "Plugin Management",
    risk: "medium",
    action: "deactivate_plugin",
  },
  {
    id: "activate-plugin",
    label: "Auto-activate missing dependency plugins",
    description: "Re-enable core dependencies that were accidentally deactivated.",
    group: "Plugin Management",
    risk: "low",
    action: "activate_plugin",
  },
  {
    id: "update-plugin",
    label: "Apply plugin security updates",
    description: "Auto-upgrade individual plugins to patched versions when CVE matches are detected.",
    group: "Plugin Management",
    risk: "medium",
    action: "update_plugin",
  },
  {
    id: "delete-plugin",
    label: "Auto-delete verified malware scripts",
    description: "Permanently delete malicious backdoor files isolated during binary scanner scans.",
    group: "Plugin Management",
    risk: "high",
    action: "delete_plugin",
  },
  {
    id: "switch-theme",
    label: "Switch to fallback theme during crash",
    description: "Temporarily revert to default theme when theme stylesheet or functions file breaks site compilation.",
    group: "Theme Management",
    risk: "medium",
    action: "switch_theme",
  },
  {
    id: "flush-cache",
    label: "Auto-flush system & page caches",
    description: "Purge cache layers (Redis, LiteSpeed, Nginx) after deploying a code change to verify fresh layouts.",
    group: "Maintenance",
    risk: "low",
    action: "flush_cache",
  },
  {
    id: "clear-transients",
    label: "Clear database transients",
    description: "Delete stale cached transient options causing database queries to stall.",
    group: "Maintenance",
    risk: "low",
    action: "clear_transients",
  },
  {
    id: "disable-maint",
    label: "Lift stuck maintenance mode",
    description: "Force remove stuck '.maintenance' file lockups when upgrade pipelines time out.",
    group: "Maintenance",
    risk: "low",
    action: "disable_maintenance_mode",
  },
  {
    id: "repair-db",
    label: "Automated database schema repair",
    description: "Execute structural table repair commands when MySQL logs connection or query syntax corruption.",
    group: "Database & Core",
    risk: "high",
    action: "repair_db",
  },
  {
    id: "update-core",
    label: "Apply WordPress core updates",
    description: "Perform minor security upgrades to WordPress core software packages.",
    group: "Database & Core",
    risk: "high",
    action: "update_core",
  },
]

export const initialTeam = [
  { id: "m1", name: "You (Owner)", email: "owner@greenleafbotanicals.com", role: "Owner" },
  { id: "m2", name: "Maria Chen", email: "maria@greenleafbotanicals.com", role: "Editor" },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general")
  
  // Site credentials state
  const [siteId, setSiteId] = useState("")
  const [siteSecret, setSiteSecret] = useState("")
  const [showSecret, setShowSecret] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)

  // General Settings state
  const [siteName, setSiteName] = useState("")
  const [domain, setDomain] = useState("")
  const [wpVersion, setWpVersion] = useState("")
  
  // Permissions state
  const [permTier, setPermTier] = useState("some_access") // full_auto, manual, custom
  const [allowedActions, setAllowedActions] = useState<string[]>([])
  const [customExpanded, setCustomExpanded] = useState(false)

  // Notifications & team
  const [notificationEmail, setNotificationEmail] = useState("owner@greenleafbotanicals.com")
  const [slackWebhook, setSlackWebhook] = useState("https://hooks.slack.com/services/...")
  const [team, setTeam] = useState(initialTeam)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("Editor")
  const [loading, setLoading] = useState(true)

  const tabs = [
    { id: "general", label: "General" },
    { id: "permissions", label: "Permissions" },
    { id: "notifications", label: "Notifications" },
    { id: "team", label: "Team" },
    { id: "billing", label: "Billing" },
  ]

  // Fetch settings from API on load
  useEffect(() => {
    fetch("http://localhost:4000/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSiteId(data.id || "")
        setSiteSecret(data.siteSecret || "")
        setSiteName(data.url || "")
        setDomain(data.url || "")
        setWpVersion(data.wpVersion || "Unknown")
        
        const tier = data.permissionTier || "some_access"
        setPermTier(tier === "some_access" ? "custom" : tier)
        setAllowedActions(data.allowedActions || [])
        
        if (tier === "some_access" || tier === "custom") {
          setCustomExpanded(true)
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error("Failed to load live settings:", err)
        setLoading(false)
      })
  }, [])

  // Call API to save settings
  const saveSettingsToDB = async (tier: string, actions: string[]) => {
    try {
      await fetch("http://localhost:4000/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          permissionTier: tier === "custom" ? "custom" : tier,
          allowedActions: actions,
          url: domain || undefined,
        }),
      })
    } catch (err) {
      console.error("Failed to save settings:", err)
    }
  }

  // Handle Mode Selection click
  const handleModeChange = (mode: string) => {
    setPermTier(mode)
    let newActions: string[] = []
    
    if (mode === "full_auto") {
      newActions = defaultPermissions.map(p => p.action)
      setCustomExpanded(false)
    } else if (mode === "manual") {
      newActions = []
      setCustomExpanded(false)
    } else if (mode === "custom") {
      newActions = [...allowedActions]
      if (newActions.length === 0) {
        // default custom permissions
        newActions = ["deactivate_plugin", "activate_plugin", "flush_cache", "clear_transients", "disable_maintenance_mode", "switch_theme"]
      }
      setCustomExpanded(true)
    }
    
    setAllowedActions(newActions)
    saveSettingsToDB(mode, newActions)
  }

  // Handle individual capability toggle
  const handleToggleAction = (actionSlug: string, alwaysOn?: boolean) => {
    if (alwaysOn) return

    setAllowedActions((prev) => {
      let nextActions = [...prev]
      if (nextActions.includes(actionSlug)) {
        nextActions = nextActions.filter((a) => a !== actionSlug)
      } else {
        // Double check confirmation for high risk actions
        const targetPerm = defaultPermissions.find(p => p.action === actionSlug)
        if (targetPerm?.risk === "high") {
          const ok = confirm(`WARNING: Enabling "${targetPerm.label}" allows the AI agent to make high-risk modifications automatically on your site. Are you sure you want to proceed?`)
          if (!ok) return prev
        }
        nextActions.push(actionSlug)
      }

      // Check if all are on/off to auto-sync mode card
      const togglableActions = defaultPermissions.filter(p => !p.alwaysOn)
      const toggledOnList = togglableActions.filter(p => nextActions.includes(p.action))

      let finalMode = "custom"
      if (toggledOnList.length === togglableActions.length) {
        finalMode = "full_auto"
      } else if (toggledOnList.length === 0) {
        finalMode = "manual"
      }

      setPermTier(finalMode)
      saveSettingsToDB(finalMode, nextActions)
      return nextActions
    })
  }

  const copyToClipboard = (text: string, setter: (val: boolean) => void) => {
    navigator.clipboard.writeText(text)
    setter(true)
    setTimeout(() => setter(false), 2000)
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

  // Helper to render risk badge
  const getRiskBadge = (risk: "low" | "medium" | "high") => {
    if (risk === "low") return <Badge variant="success">low risk</Badge>
    if (risk === "medium") return <Badge variant="warning">medium risk</Badge>
    return <Badge variant="danger">high risk</Badge>
  }

  // Group permissions
  const groups = Array.from(new Set(defaultPermissions.map(p => p.group)))

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

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground animate-pulse">Loading settings...</span>
          </div>
        ) : (
          <>
            {/* Tab: General */}
            {activeTab === "general" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader title="Site Identity" description="Basic WordPress installation configurations." icon={Settings} />
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">Site Name / Title</label>
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

                    {/* Site Credentials & Keys section */}
                    <div className="pt-2 grid grid-cols-1 gap-4 md:grid-cols-2 border-t border-border">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">Site ID (Read Only)</label>
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="text"
                            readOnly
                            value={siteId}
                            className="h-9 flex-1 rounded-lg border border-border bg-muted/30 px-3 text-sm font-mono outline-none"
                          />
                          <button
                            onClick={() => copyToClipboard(siteId, setCopiedId)}
                            className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted/30 transition-all cursor-pointer"
                          >
                            {copiedId ? <Check className="size-4 text-success" /> : <Copy className="size-4 text-muted-foreground" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block">Site Secret (For HMAC Signing)</label>
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type={showSecret ? "text" : "password"}
                            readOnly
                            value={siteSecret}
                            className="h-9 flex-1 rounded-lg border border-border bg-muted/30 px-3 text-sm font-mono outline-none"
                          />
                          <button
                            onClick={() => setShowSecret(!showSecret)}
                            className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted/30 transition-all cursor-pointer"
                          >
                            {showSecret ? <EyeOff className="size-4 text-muted-foreground" /> : <Eye className="size-4 text-muted-foreground" />}
                          </button>
                          <button
                            onClick={() => copyToClipboard(siteSecret, setCopiedSecret)}
                            className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted/30 transition-all cursor-pointer"
                          >
                            {copiedSecret ? <Check className="size-4 text-success" /> : <Copy className="size-4 text-muted-foreground" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 text-xs border-t border-border">
                      <div>
                        <span className="text-muted-foreground block">WP CORE</span>
                        <span className="font-semibold">{wpVersion}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">PHP RUNTIME</span>
                        <span className="font-semibold">8.2.27</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">ACTIVE THEME</span>
                        <span className="font-semibold">Twenty Twenty-Four</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">EXECUTION PATH</span>
                        <span className="font-semibold">Legacy Outbound Plugin</span>
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
                        desc: "Apply all staging-validated fixes automatically. Zero downtime wait.",
                      },
                      {
                        id: "manual",
                        label: "Manual Approval Only",
                        desc: "SyntaxWP will test staging fixes and always await your OK before applying.",
                      },
                      {
                        id: "custom",
                        label: "Custom Permissions",
                        desc: "Enable or disable individual agent write capabilities based on risk.",
                      },
                     ].map((tier) => (
                      <div
                        key={tier.id}
                        onClick={() => handleModeChange(tier.id)}
                        className={cn(
                          "cursor-pointer border rounded-3xl p-5 transition-all duration-200 hover:shadow-xs flex flex-col justify-between h-full min-h-[140px]",
                          permTier === tier.id
                            ? "border-primary bg-primary text-primary-foreground shadow-md"
                            : "border-border bg-card text-foreground hover:border-muted-foreground/30"
                        )}
                      >
                        <div>
                          <span className={cn(
                            "font-semibold text-sm block",
                            permTier === tier.id ? "text-white" : "text-foreground"
                          )}>{tier.label}</span>
                          <span className={cn(
                            "text-xs block mt-1.5 leading-relaxed",
                            permTier === tier.id ? "text-primary-foreground/90" : "text-muted-foreground"
                          )}>{tier.desc}</span>
                        </div>
                        {tier.id === "custom" && (
                          <div className={cn(
                            "mt-3 flex items-center gap-1 text-2xs font-semibold",
                            permTier === tier.id ? "text-white/95" : "text-primary"
                          )}>
                            <span>Configure custom capabilities</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Granular Custom Permission List */}
                <div className={cn(
                  "space-y-6 transition-all duration-300",
                  permTier !== "custom" && "opacity-55 pointer-events-none select-none"
                )}>
                  {groups.map((group) => {
                    const groupPermissions = defaultPermissions.filter(p => p.group === group)
                    return (
                      <Card key={group} className="divide-y divide-border overflow-hidden">
                        <div className="px-5 py-4 bg-muted/20 border-b border-border flex items-center justify-between">
                          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">{group}</h3>
                          {group.includes("Security") && (
                            <span className="text-3xs font-semibold text-success uppercase tracking-wider bg-success-soft px-2 py-0.5 rounded-full">Active Protection</span>
                          )}
                        </div>
                        {groupPermissions.map((perm) => {
                          const isChecked = perm.alwaysOn || allowedActions.includes(perm.action)
                          return (
                            <div key={perm.id} className="flex items-start justify-between gap-4 p-5 hover:bg-muted/10 transition-colors">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-sm text-foreground">{perm.label}</span>
                                  {getRiskBadge(perm.risk)}
                                  {perm.alwaysOn && (
                                    <span className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/60 px-1.5 py-0.5 rounded">Always On</span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground max-w-xl text-pretty leading-relaxed">
                                  {perm.description}
                                  {perm.alwaysOn && permTier === "manual" && (
                                    <span className="text-3xs text-danger font-medium block mt-1">Note: Security scans run but no automated fixes will be applied.</span>
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {perm.risk === "high" && !isChecked && (
                                  <Lock className="size-3.5 text-muted-foreground/60" />
                                )}
                                <Toggle 
                                  checked={isChecked} 
                                  disabled={perm.alwaysOn || permTier !== "custom"}
                                  onChange={() => handleToggleAction(perm.action, perm.alwaysOn)} 
                                />
                              </div>
                            </div>
                          )
                        })}
                      </Card>
                    )
                  })}
                </div>
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
                        Includes 60-second multi-region uptime checks, visual regression staging verification, and 30-day snapshot rotations.
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
          </>
        )}
      </div>
    </AppShell>
  )
}
