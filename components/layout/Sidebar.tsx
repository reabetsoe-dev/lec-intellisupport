"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Boxes,
  ClipboardList,
  Gauge,
  MessageCircleQuestion,
  Package,
  PackagePlus,
  Ticket,
  type LucideIcon,
  Wrench,
} from "lucide-react"

import { type UserRole } from "@/lib/auth"
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
      { href: "/employee/consumables", label: "Consumables", icon: Package },
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
  role: UserRole
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const section = menuByRole[role]

  return (
    <aside className="flex h-screen w-20 shrink-0 flex-col border-r border-sky-400 bg-sky-300 text-sky-950 md:w-72">
      <div className="border-b border-sky-400 px-4 py-5 md:px-6">
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
        <p className="text-center text-sm font-semibold tracking-wide text-sky-950 md:text-left">LEC INTELLI-SUPPORT</p>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-6 md:px-4">
        <div key={section.label}>
          <p className="hidden px-3 text-xs font-semibold tracking-[0.08em] text-sky-900/70 uppercase md:block">
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
                      ? "bg-sky-500 text-white"
                      : "text-sky-900 hover:bg-sky-500 hover:text-white"
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
    </aside>
  )
}
