"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  Boxes,
  ClipboardList,
  Clock3,
  Gauge,
  History,
  LogOut,
  MessageCircleQuestion,
  Package,
  PackagePlus,
  PhoneCall,
  QrCode,
  Ticket,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { clearUserSession, getDisplayUserName, getRoleLabel, type AuthUser, type UserRole } from "@/lib/auth"
import { cn } from "@/lib/utils"

type MenuItem = {
  href: string
  label: string
  mobileLabel?: string
  icon: LucideIcon
}

type MenuSection = {
  label: string
  items: MenuItem[]
}

const menuByRole: Record<UserRole, MenuSection> = {
  employee: {
    label: "Employee",
    items: [
      { href: "/employee/dashboard", label: "Dashboard", mobileLabel: "Home", icon: Gauge },
      { href: "/employee/profile", label: "Profile", mobileLabel: "Profile", icon: UserRound },
      { href: "/employee/report", label: "Report Fault", mobileLabel: "Report", icon: MessageCircleQuestion },
      { href: "/employee/tickets", label: "My Tickets", mobileLabel: "Tickets", icon: ClipboardList },
      { href: "/employee/consumables", label: "Consumable Request", mobileLabel: "Request", icon: PackagePlus },
      { href: "/employee/my-consumables", label: "My Consumables", mobileLabel: "Assets", icon: Package },
    ],
  },
  technician: {
    label: "Technician",
    items: [
      { href: "/technician/dashboard", label: "Dashboard", mobileLabel: "Home", icon: Wrench },
      { href: "/technician/tickets", label: "Assigned Tickets", mobileLabel: "Tickets", icon: Ticket },
      { href: "/technician/hardware-request", label: "Office Asset Request", mobileLabel: "Asset Req", icon: PackagePlus },
    ],
  },
  admin_fault: {
    label: "Admin Fault",
    items: [
      { href: "/admin-fault/dashboard", label: "Dashboard", mobileLabel: "Home", icon: Gauge },
      { href: "/admin-fault/tickets", label: "All Tickets", mobileLabel: "Tickets", icon: Ticket },
      { href: "/admin-fault/log-call", label: "Log Call", mobileLabel: "Call", icon: PhoneCall },
      { href: "/admin-fault/sla", label: "SLA Tracking", mobileLabel: "SLA", icon: Clock3 },
      { href: "/admin-fault/technician-access", label: "Technician QR", mobileLabel: "QR", icon: QrCode },
      { href: "/admin-fault/business-hours", label: "Business Hours", mobileLabel: "Hours", icon: Clock3 },
      { href: "/admin-fault/performance", label: "Performance", mobileLabel: "Stats", icon: BarChart3 },
    ],
  },
  admin_consumables: {
    label: "Admin Consumables",
    items: [
      { href: "/admin-consumables/dashboard", label: "Dashboard", mobileLabel: "Home", icon: Gauge },
      { href: "/admin-consumables/inventory", label: "Assets", mobileLabel: "Assets", icon: Boxes },
      { href: "/admin-consumables/returns", label: "Returns", mobileLabel: "Returns", icon: History },
      { href: "/admin-consumables", label: "Add Assets", mobileLabel: "Add", icon: PackagePlus },
    ],
  },
  manager: {
    label: "Manager",
    items: [
      { href: "/manager/dashboard", label: "Dashboard", mobileLabel: "Home", icon: Gauge },
      { href: "/manager/tickets", label: "Ticket Oversight", mobileLabel: "Tickets", icon: ClipboardList },
      { href: "/manager/sla", label: "SLA Tracking", mobileLabel: "SLA", icon: Clock3 },
      { href: "/manager/performance", label: "Performance", mobileLabel: "Stats", icon: BarChart3 },
      { href: "/manager/resources", label: "Resource Oversight", mobileLabel: "Resources", icon: Boxes },
    ],
  },
}

type SidebarProps = {
  user: AuthUser
}

function isMenuItemActive(pathname: string, section: MenuSection, item: MenuItem): boolean {
  const hasNestedMenuEntries = section.items.some(
    (candidate) => candidate.href !== item.href && candidate.href.startsWith(`${item.href}/`)
  )

  return pathname === item.href || (!hasNestedMenuEntries && pathname.startsWith(`${item.href}/`))
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname() ?? ""
  const router = useRouter()
  const section = menuByRole[user.role]
  const displayUserName = getDisplayUserName(user)

  return (
    <>
      <aside className="hidden h-screen w-20 shrink-0 flex-col border-r border-[#0072CE]/35 bg-[#0B1F3A] text-white md:flex md:w-72">
        <div className="border-b border-[#0072CE]/35 px-4 py-5 md:px-6">
          <div className="mb-3 flex justify-center md:justify-start">
            <Image
              src="/lec-logo.png"
              alt="LEC logo"
              width={220}
              height={74}
              className="h-auto w-40 rounded-sm object-contain md:w-52"
              priority
            />
          </div>
          <p className="text-center text-sm font-semibold tracking-[0.12em] text-[#B5D7FF] uppercase md:text-left">
            LEC Intelli-Support
          </p>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-6 md:px-4">
          <div>
            <p className="hidden px-3 text-xs font-semibold tracking-[0.08em] text-[#7FB3E8] uppercase md:block">
              {section.label}
            </p>
            <div className="mt-2 space-y-1">
              {section.items.map((item) => {
                const isActive = isMenuItemActive(pathname, section, item)
                const Icon = item.icon

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:justify-start",
                      isActive
                        ? "bg-[#0072CE] text-white"
                        : "text-[#D5E8FF] hover:bg-[#15406E] hover:text-white"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden md:inline">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </nav>

        <div className="border-t border-[#0072CE]/35 px-3 py-4 md:px-4">
          <div className="mb-3 hidden rounded-lg border border-[#0072CE]/35 bg-[#0F2E57] px-3 py-2 md:block">
            <p className="text-[11px] tracking-[0.08em] text-[#A8CCF5] uppercase">Signed In</p>
            <p className="mt-0.5 text-sm font-semibold text-white">{displayUserName}</p>
            <p className="text-xs text-[#A8CCF5]">{getRoleLabel(user.role)}</p>
          </div>

          <Button
            variant="outline"
            className="h-9 w-full border-[#0072CE]/45 bg-[#123967] text-white hover:bg-[#1A4E86] hover:text-white"
            onClick={() => {
              clearUserSession()
              router.push("/login")
            }}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden md:inline">Logout</span>
          </Button>
        </div>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#0072CE]/35 bg-[#0B1F3A]/95 px-2 py-2 shadow-[0_-12px_28px_rgba(3,14,30,0.32)] backdrop-blur md:hidden">
        <div className="mb-2 flex items-center justify-between gap-3 px-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{displayUserName}</p>
            <p className="text-[11px] text-[#A8CCF5]">{getRoleLabel(user.role)}</p>
          </div>
          <button
            type="button"
            className="inline-flex touch-manipulation items-center gap-1 rounded-full border border-[#2F6BA7] bg-[#123967] px-3 py-1.5 text-xs font-semibold text-white"
            onClick={() => {
              clearUserSession()
              router.push("/login")
            }}
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </button>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-1 pb-1">
          {section.items.map((item) => {
            const isActive = isMenuItemActive(pathname, section, item)
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex min-w-[5rem] touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-2 text-center text-[11px] font-semibold whitespace-nowrap transition-colors",
                  isActive
                    ? "border-[#4EA9FF] bg-[#0072CE] text-white"
                    : "border-[#1F4267] bg-[#102744] text-[#D5E8FF]"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.mobileLabel ?? item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}
