import {
  LayoutDashboard,
  ArrowUpCircle,
  ShieldAlert,
  ShieldCheck,
  Gauge,
  ShoppingCart,
  History,
  FileText,
  Settings,
  Palette,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  badge?: number
}

export const navItems: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Incidents", href: "/incidents", icon: ShieldAlert, badge: 2 },
  { label: "Updates", href: "/updates", icon: ArrowUpCircle, badge: 4 },
  { label: "Security", href: "/security", icon: ShieldCheck },
  { label: "Performance", href: "/performance", icon: Gauge },
  { label: "Store protection", href: "/store", icon: ShoppingCart },
  { label: "Restore points", href: "/restore-points", icon: History },
  { label: "Reports", href: "/reports", icon: FileText },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Design System", href: "/design", icon: Palette },
]
