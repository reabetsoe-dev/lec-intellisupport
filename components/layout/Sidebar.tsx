"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRouter } from "next/navigation"
import {
  Boxes,
  ClipboardList,
  Gauge,
  LogOut,
  MessageCircleQuestion,
  Package,
  PackagePlus,
  Ticket,
  type LucideIcon,
  Wrench,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { clearUserSession, getRoleLabel, type AuthUser, type UserRole } from "@/lib/auth"
import { cn } from "@/lib/utils"

type MenuSection = {
  label: string
  items: Array<{ href: string; label: string; icon: LucideIcon }>
}

const menuByRole: Record<UserRole, MenuSection> = {
  employee: {
    label: "Employee",
    items: [
      { href: "/employee/dashboard", label: "Dashboard", icon: Gauge },
      { href: "/employee/report", label: "Report Fault", icon: MessageCircleQuestion },
      { href: "/employee/tickets", label: "My Tickets", icon: ClipboardList },
      { href: "/employee/consumables", label: "Consumable Request", icon: PackagePlus },
      { href: "/employee/my-consumables", label: "My Consumables", icon: Package },
    ],
  },
  technician: {
    label: "Technician",
    items: [
      { href: "/technician/dashboard", label: "Dashboard", icon: Wrench },
      { href: "/technician/tickets", label: "Assigned Tickets", icon: Ticket },
    ],
  },
  admin_fault: {
    label: "Admin Fault",
    items: [
      { href: "/admin-fault/dashboard", label: "Dashboard", icon: Gauge },
      { href: "/admin-fault/tickets", label: "All Tickets", icon: ClipboardList },
    ],
  },
  admin_consumables: {
    label: "Admin Consumables",
    items: [
      { href: "/admin-consumables/dashboard", label: "Dashboard", icon: Gauge },
      { href: "/admin-consumables/inventory", label: "Inventory", icon: Boxes },
      { href: "/admin-consumables", label: "Add Consumable", icon: PackagePlus },
    ],
  },
}

type SidebarProps = {
  user: AuthUser
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const section = menuByRole[user.role]

  return (
    <aside className="flex h-screen w-20 shrink-0 flex-col border-r border-[#0072CE]/35 bg-[#0B1F3A] text-white md:w-72">
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
        <div key={section.label}>
          <p className="hidden px-3 text-xs font-semibold tracking-[0.08em] text-[#7FB3E8] uppercase md:block">
            {section.label}
          </p>
          <div className="mt-2 space-y-1">
            {section.items.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`)
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
          <p className="mt-0.5 text-sm font-semibold text-white">{user.name}</p>
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
  )
}
