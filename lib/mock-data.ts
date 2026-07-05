// Central mock data for the SyntaxWP dashboard.
// Everything here is fake, static demo content — no backend required.

export type Status = "healthy" | "warning" | "critical"

export type NavKey =
  | "overview"
  | "incidents"
  | "security"
  | "performance"
  | "store"
  | "restore-points"
  | "reports"
  | "settings"

export const site = {
  name: "GreenLeaf Botanicals",
  domain: "greenleafbotanicals.com",
  platform: "WooCommerce",
  plan: "Guardian Pro",
  healthScore: 87,
  wpVersion: "7.0.1",
  phpVersion: "8.2.10",
  theme: "Twenty Twenty-Seven 1.0",
  monitoredSince: "March 2025",
  uptime7d: 99.98,
  uptime30d: 99.92,
  ssl: { daysRemaining: 84, issuer: "Let's Encrypt", status: "healthy" as Status },
  domainExpiry: { daysRemaining: 213, status: "healthy" as Status },
  lastBackupHours: 2,
  activeUsersOnline: 12,
}

export const quickStats = [
  {
    key: "protected",
    label: "Days protected",
    value: "312",
    caption: "Since March 2025",
    trend: "up" as const,
    trendLabel: "Always on",
    tone: "success" as const,
  },
  {
    key: "fixed",
    label: "Issues auto-fixed",
    value: "48",
    caption: "Zero downtime for you",
    trend: "up" as const,
    trendLabel: "+3 this week",
    tone: "primary" as const,
  },
  {
    key: "revenue",
    label: "Revenue protected",
    value: "$14,280",
    caption: "Estimated sales saved",
    trend: "up" as const,
    trendLabel: "Last 30 days",
    tone: "success" as const,
  },
  {
    key: "uptime",
    label: "Uptime this month",
    value: "99.92%",
    caption: "Only 34 min offline",
    trend: "flat" as const,
    trendLabel: "Excellent",
    tone: "info" as const,
  },
]

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
  category: "Plugin conflict" | "Security" | "Performance" | "Checkout" | "Uptime" | "Fatal error"
  status: Status
  stage: "monitoring" | "diagnosing" | "testing" | "awaiting-approval" | "deploying" | "verifying" | "resolved"
  detectedAgo: string
  fix: string
  risk: "Low" | "Medium" | "High"
  reversible: string
  steps: IncidentStep[]
  evidence: { label: string; value: string }[]
}

export const activeIncident: Incident = {
  id: "INC-2048",
  title: "Checkout button conflict detected",
  subtitle: "Stripe Payments Pro + WooCommerce 9.1",
  category: "Plugin conflict",
  status: "warning",
  stage: "awaiting-approval",
  detectedAgo: "3 minutes ago",
  fix: "Roll Stripe Payments Pro back to version 4.1.9 — the last version that worked perfectly with your store.",
  risk: "Low",
  reversible: "Yes, instantly",
  steps: [
    { label: "We spotted the issue", detail: "Checkout button stopped responding on mobile", time: "08:14:22", state: "done" },
    { label: "We found the cause", detail: "Stripe plugin 4.2.1 isn't compatible with WooCommerce 9.1", time: "08:14:35", state: "done" },
    { label: "We tested a fix safely", detail: "Verified on a private copy of your site — checkout works again", time: "08:15:01", state: "done" },
    { label: "Waiting for your OK", detail: "One click and we'll apply it to your live store", state: "current" },
    { label: "Apply fix to live store", state: "upcoming" },
    { label: "Confirm everything is healthy", state: "upcoming" },
  ],
  evidence: [
    { label: "Affected page", value: "/checkout" },
    { label: "Impact", value: "Mobile shoppers can't pay" },
    { label: "Tested on", value: "Private staging copy" },
    { label: "Restore point", value: "Ready — Today 08:14" },
  ],
}

export const activeDatabaseIncident: Incident = {
  id: "INC-2046",
  title: "Critical database table crash detected",
  subtitle: "wp_options table is marked as crashed and should be repaired",
  category: "Fatal error",
  status: "critical",
  stage: "awaiting-approval",
  detectedAgo: "10 seconds ago",
  fix: "Run native MySQL repair query table 'wp_options' to recover corrupted indexes.",
  risk: "Medium",
  reversible: "Yes, automatic schema backup generated",
  steps: [
    { label: "We spotted the database crash", detail: "MySQL returned Error 144 on wp_options write check", time: "20:57:42", state: "done" },
    { label: "We found the cause", detail: "Storage write interruption during bulk transients flush", time: "20:57:45", state: "done" },
    { label: "We tested a fix safely", detail: "Verified index rebuild on private staging copy - table successfully recovered", time: "20:58:01", state: "done" },
    { label: "Waiting for your OK", detail: "One click and we will repair the live table", state: "current" },
    { label: "Execute live repair query", state: "upcoming" },
    { label: "Confirm database health", state: "upcoming" },
  ],
  evidence: [
    { label: "Crashed Table", value: "wp_options" },
    { label: "MySQL Error", value: "144 (Table crashed)" },
    { label: "Staged Test", value: "Passed (100% data intact)" },
    { label: "Restore point", value: "Ready - Today 20:57" },
  ],
}

export const incidents: (Incident & { resolvedAt?: string })[] = [
  activeDatabaseIncident,
  activeIncident,
  {
    id: "INC-2045",
    title: "PHP Fatal Error in Elementor core",
    subtitle: "Call to undefined function elementor_get_rendering_state",
    category: "Fatal error",
    status: "healthy",
    stage: "resolved",
    detectedAgo: "1 day ago",
    resolvedAt: "Resolved in 2 minutes",
    fix: "Replaced corrupted file 'class-elementor-utils.php' with clean baseline checksum from WordPress.org API repository.",
    risk: "Low",
    reversible: "Yes, instantly",
    steps: [
      { label: "We spotted the fatal error", detail: "Spotted uncaught runtime error in admin dashboard", time: "Jun 30 · 15:40", state: "done" },
      { label: "We found the cause", detail: "Corrupted functions definition file after incomplete automatic update", time: "Jun 30 · 15:40", state: "done" },
      { label: "We tested a fix safely", detail: "Restored clean file copy in staging environment", time: "Jun 30 · 15:41", state: "done" },
      { label: "Fix applied automatically", detail: "Low-risk file checksum sync applied under auto-fix permissions", time: "Jun 30 · 15:42", state: "done" },
      { label: "Confirmed healthy", time: "Jun 30 · 15:42", state: "done" },
    ],
    evidence: [
      { label: "Affected file", value: "/plugins/elementor/core/class-elementor-utils.php" },
      { label: "Error Type", value: "E_ERROR (Fatal)" },
      { label: "Restore point", value: "Ready - Jun 30 · 15:40" },
    ],
  },
  {
    id: "INC-2041",
    title: "Homepage loading slowly",
    subtitle: "Large uncompressed hero image",
    category: "Performance",
    status: "healthy",
    stage: "resolved",
    detectedAgo: "2 days ago",
    resolvedAt: "Resolved in 4 minutes",
    fix: "Compressed and cached the homepage banner image.",
    risk: "Low",
    reversible: "Yes",
    steps: [
      { label: "We spotted the issue", time: "Jun 29 · 11:02", state: "done" },
      { label: "We found the cause", time: "Jun 29 · 11:03", state: "done" },
      { label: "We tested a fix safely", time: "Jun 29 · 11:05", state: "done" },
      { label: "Fix applied automatically", detail: "Low-risk fix, applied under your auto-approve rule", time: "Jun 29 · 11:06", state: "done" },
      { label: "Confirmed healthy", time: "Jun 29 · 11:06", state: "done" },
    ],
    evidence: [
      { label: "Load time before", value: "4.1s" },
      { label: "Load time after", value: "1.3s" },
    ],
  },
  {
    id: "INC-2035",
    title: "Security update available",
    subtitle: "Contact Form 7 · known vulnerability patched",
    category: "Security",
    status: "healthy",
    stage: "resolved",
    detectedAgo: "5 days ago",
    resolvedAt: "Resolved in 9 minutes",
    fix: "Updated Contact Form 7 to the patched version after staging test.",
    risk: "Low",
    reversible: "Yes",
    steps: [
      { label: "We spotted the issue", time: "Jun 26 · 09:41", state: "done" },
      { label: "We tested the update safely", time: "Jun 26 · 09:48", state: "done" },
      { label: "You approved the update", time: "Jun 26 · 09:50", state: "done" },
      { label: "Update applied & verified", time: "Jun 26 · 09:50", state: "done" },
    ],
    evidence: [
      { label: "Vulnerability", value: "CVE-2025-1842 (High)" },
      { label: "Status", value: "Patched" },
    ],
  },
  {
    id: "INC-2028",
    title: "Brief outage recovered",
    subtitle: "Host maintenance caused a 6-minute blip",
    category: "Uptime",
    status: "healthy",
    stage: "resolved",
    detectedAgo: "1 week ago",
    resolvedAt: "Self-recovered · monitored",
    fix: "No action needed — site recovered on its own. We kept watch.",
    risk: "Low",
    reversible: "N/A",
    steps: [
      { label: "We detected downtime", time: "Jun 24 · 03:12", state: "done" },
      { label: "We kept probing every region", time: "Jun 24 · 03:12", state: "done" },
      { label: "Site came back online", time: "Jun 24 · 03:18", state: "done" },
    ],
    evidence: [
      { label: "Downtime", value: "6 minutes" },
      { label: "Time of day", value: "Off-peak (3 AM)" },
    ],
  },
]

export const restorePoints = [
  { id: "rp-1", label: "Before checkout fix", time: "Today · 08:14", type: "Automatic", size: "142 MB", current: false },
  { id: "rp-2", label: "Daily safety snapshot", time: "Today · 04:00", type: "Automatic", size: "141 MB", current: true },
  { id: "rp-3", label: "Before plugin update", time: "Jun 29 · 11:05", type: "Automatic", size: "140 MB", current: false },
  { id: "rp-4", label: "Daily safety snapshot", time: "Jun 28 · 04:00", type: "Automatic", size: "139 MB", current: false },
  { id: "rp-5", label: "Manual backup", time: "Jun 27 · 09:01", type: "Manual", size: "138 MB", current: false },
  { id: "rp-6", label: "Daily safety snapshot", time: "Jun 25 · 04:00", type: "Automatic", size: "137 MB", current: false },
]

export type Vulnerability = {
  id: string
  plugin: string
  severity: "Critical" | "High" | "Medium" | "Low"
  summary: string
  status: "Patched automatically" | "Update available" | "Monitoring"
  detected: string
}

export const vulnerabilities: Vulnerability[] = [
  {
    id: "v1",
    plugin: "LiteSpeed Cache",
    severity: "Medium",
    summary: "Cache poisoning issue in versions below 6.2.0.1.",
    status: "Update available",
    detected: "6 hours ago",
  },
  {
    id: "v2",
    plugin: "Contact Form 7",
    severity: "High",
    summary: "Cross-site scripting fixed in 5.9.3.",
    status: "Patched automatically",
    detected: "5 days ago",
  },
  {
    id: "v3",
    plugin: "Yoast SEO",
    severity: "Low",
    summary: "Minor information disclosure, low real-world impact.",
    status: "Monitoring",
    detected: "1 week ago",
  },
]

export const securityChecks = [
  { label: "SSL certificate", value: "Valid · 84 days left", status: "healthy" as Status },
  { label: "Domain registration", value: "Renews in 213 days", status: "healthy" as Status },
  { label: "File integrity scan", value: "No unexpected changes", status: "healthy" as Status },
  { label: "Admin login protection", value: "Brute-force shield active", status: "healthy" as Status },
  { label: "Plugin vulnerability feed", value: "1 update recommended", status: "warning" as Status },
  { label: "Malware & backdoor scan", value: "Clean · scanned 2h ago", status: "healthy" as Status },
]

export const updates = [
  { id: "u1", name: "LiteSpeed Cache", from: "6.1.0", to: "6.2.0.1", type: "Security", recommended: true },
  { id: "u2", name: "WooCommerce", from: "9.1.0", to: "9.1.2", type: "Feature", recommended: true },
  { id: "u3", name: "Astra Theme", from: "4.6.2", to: "4.6.4", type: "Maintenance", recommended: false },
]

export const performance = {
  score: 92,
  metrics: [
    { label: "Loading (LCP)", value: "1.3s", target: "Under 2.5s", status: "healthy" as Status, pct: 82 },
    { label: "Interactivity (INP)", value: "94ms", target: "Under 200ms", status: "healthy" as Status, pct: 88 },
    { label: "Visual stability (CLS)", value: "0.04", target: "Under 0.1", status: "healthy" as Status, pct: 91 },
    { label: "Time to first byte", value: "320ms", target: "Under 600ms", status: "healthy" as Status, pct: 78 },
  ],
  // 14-day mini series (page load seconds), lower is better
  loadTrend: [2.4, 2.2, 2.5, 2.1, 1.9, 2.0, 1.8, 1.7, 1.6, 1.9, 1.5, 1.4, 1.3, 1.3],
  pageWeightKb: 890,
}

export const storeProtection = {
  checkoutStatus: "healthy" as Status,
  lastCheckoutTest: "4 minutes ago",
  checkoutTestsToday: 144,
  paymentGateways: [
    { name: "Stripe", status: "healthy" as Status, note: "Card payments working" },
    { name: "PayPal", status: "healthy" as Status, note: "Express checkout working" },
    { name: "Apple Pay", status: "healthy" as Status, note: "Available on mobile" },
  ],
  revenue: {
    avgHourly: 79,
    protected30d: 14280,
    currency: "USD",
    peakHours: "6 PM – 10 PM",
  },
  // 24-point synthetic checkout success (%) over last 24h
  checkoutSuccess: [100, 100, 100, 98, 100, 100, 100, 100, 96, 100, 100, 100, 100, 100, 100, 100, 100, 92, 100, 100, 100, 100, 100, 100],
}

export const reports = [
  { id: "r1", title: "June 2025 · Monthly health report", period: "Jun 1 – Jun 30", issues: 12, uptime: "99.92%", ready: true },
  { id: "r2", title: "May 2025 · Monthly health report", period: "May 1 – May 31", issues: 9, uptime: "99.97%", ready: true },
  { id: "r3", title: "April 2025 · Monthly health report", period: "Apr 1 – Apr 30", issues: 15, uptime: "99.89%", ready: true },
]

export const permissionSettings = [
  {
    id: "auto-security",
    label: "Auto-apply security patches",
    description: "We test and apply critical security fixes automatically after a staging check.",
    enabled: true,
    recommended: true,
  },
  {
    id: "auto-low-risk",
    label: "Auto-fix low-risk issues",
    description: "Small, reversible fixes (like image compression) happen without asking.",
    enabled: true,
    recommended: true,
  },
  {
    id: "ask-plugin",
    label: "Ask before plugin updates",
    description: "We'll test updates in staging and wait for your one-click approval.",
    enabled: true,
    recommended: true,
  },
  {
    id: "ask-major",
    label: "Ask before major changes",
    description: "Anything that touches checkout, themes, or the database always needs your OK.",
    enabled: true,
    recommended: true,
  },
  {
    id: "maintenance-window",
    label: "Only apply fixes during off-peak hours",
    description: "Schedule changes between 1 AM and 5 AM to avoid busy shopping times.",
    enabled: false,
    recommended: false,
  },
]

export const activityFeed = [
  { id: "a1", text: "Checkout tested successfully across 3 payment methods", time: "4 min ago", tone: "success" as const },
  { id: "a2", text: "New security advisory matched to LiteSpeed Cache", time: "6 hours ago", tone: "warning" as const },
  { id: "a3", text: "Daily safety snapshot created", time: "Today · 04:00", tone: "info" as const },
  { id: "a4", text: "Homepage speed improved automatically", time: "2 days ago", tone: "success" as const },
  { id: "a5", text: "Contact Form 7 security patch applied", time: "5 days ago", tone: "success" as const },
]

export const teamMembers = [
  { id: "m1", name: "You (Owner)", email: "owner@greenleafbotanicals.com", role: "Owner" },
  { id: "m2", name: "Maria Chen", email: "maria@greenleafbotanicals.com", role: "Editor" },
]

export type AuditLogEntry = {
  id: string
  timestamp: string
  actor: string
  action: string
  details: string
  severity: "low" | "medium" | "high"
}

export const auditLog: AuditLogEntry[] = [
  { id: "a-1", timestamp: "Today, 08:15:01", actor: "System", action: "Staging Test Passed", details: "Visual diff verified checkout page 100% match.", severity: "low" },
  { id: "a-2", timestamp: "Today, 08:14:35", actor: "System", action: "Conflict Diagnosed", details: "WooCommerce 9.1 conflict with Stripe Payments Pro 4.2.1.", severity: "medium" },
  { id: "a-3", timestamp: "Yesterday, 14:22:10", actor: "You", action: "Manual Backup Created", details: "Restore point 'Pre-launch updates' generated.", severity: "low" },
  { id: "a-4", timestamp: "Jun 29, 11:06:00", actor: "System", action: "Auto-Fix Applied", details: "Compressed banner image 'hero.jpg' (saved 1.2MB).", severity: "low" },
  { id: "a-5", timestamp: "Jun 26, 09:50:00", actor: "You", action: "Update Approved", details: "Contact Form 7 security patch applied on live.", severity: "medium" },
  { id: "a-6", timestamp: "Jun 24, 03:18:00", actor: "System", action: "Outage Resolved", details: "Site came back online after 6-minute blip.", severity: "high" }
]

export type PluginInventoryItem = {
  name: string
  slug: string
  version: string
  status: "active" | "inactive"
  updateAvailable: boolean
  latestVersion?: string
  vulnerability?: string
}

export const pluginInventory: PluginInventoryItem[] = [
  { name: "WooCommerce", slug: "woocommerce", version: "9.1.0", status: "active", updateAvailable: true, latestVersion: "9.1.2" },
  { name: "LiteSpeed Cache", slug: "litespeed-cache", version: "6.1.0", status: "active", updateAvailable: true, latestVersion: "6.2.0.1", vulnerability: "Medium" },
  { name: "Contact Form 7", slug: "contact-form-7", version: "5.9.3", status: "active", updateAvailable: false },
  { name: "Yoast SEO", slug: "yoast-seo", version: "23.2", status: "active", updateAvailable: false },
  { name: "Astra Pro", slug: "astra-pro", version: "4.6.2", status: "active", updateAvailable: true, latestVersion: "4.6.4" },
  { name: "Stripe Payments Pro", slug: "stripe-payments-pro", version: "4.2.1", status: "active", updateAvailable: false },
  { name: "Elementor", slug: "elementor", version: "3.22.0", status: "inactive", updateAvailable: false }
]

