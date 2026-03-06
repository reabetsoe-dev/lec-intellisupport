"use client"

import { Bell, ChevronRight, LogOut, Search } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { clearUserSession, getRoleLabel, type AuthUser } from "@/lib/auth"

const topbarConfig: Array<{
  match: (pathname: string) => boolean
  parent: string
  current: string
  title: string
}> = [
  {
    match: (pathname) => pathname.startsWith("/employee/report"),
    parent: "Employee",
    current: "Report Fault",
    title: "AI-Assisted Fault Intake",
  },
  {
    match: (pathname) => pathname.startsWith("/employee/tickets"),
    parent: "Employee",
    current: "My Tickets",
    title: "Employee Ticket History",
  },
  {
    match: (pathname) => pathname.startsWith("/employee/consumables"),
    parent: "Employee",
    current: "Consumables",
    title: "Consumable Stock Requests",
  },
  {
    match: (pathname) => pathname === "/employee/dashboard",
    parent: "Employee",
    current: "Dashboard",
    title: "Employee Service Portal",
  },
  {
    match: (pathname) => pathname.startsWith("/technician/tickets/"),
    parent: "Technician",
    current: "Ticket Detail",
    title: "Technician Workbench",
  },
  {
    match: (pathname) => pathname.startsWith("/technician/tickets"),
    parent: "Technician",
    current: "Assigned Tickets",
    title: "Assigned Ticket Queue",
  },
  {
    match: (pathname) => pathname === "/technician/dashboard",
    parent: "Technician",
    current: "Dashboard",
    title: "Technician Overview",
  },
  {
    match: (pathname) => pathname.startsWith("/admin-fault/tickets"),
    parent: "Admin Fault",
    current: "All Tickets",
    title: "Fault Control Center",
  },
  {
    match: (pathname) => pathname === "/admin-fault/dashboard",
    parent: "Admin Fault",
    current: "Dashboard",
    title: "Fault Management Console",
  },
  {
    match: (pathname) => pathname.startsWith("/admin-consumables/inventory"),
    parent: "Admin Consumables",
    current: "Inventory",
    title: "Consumables Inventory",
  },
  {
    match: (pathname) => pathname === "/admin-consumables/dashboard",
    parent: "Admin Consumables",
    current: "Dashboard",
    title: "Consumables Management",
  },
  {
    match: (pathname) => pathname === "/admin-consumables",
    parent: "Admin Consumables",
    current: "Add Consumable",
    title: "Asset Allocation",
  },
  {
    match: (pathname) => pathname === "/dashboard",
    parent: "Workspace",
    current: "Overview",
    title: "IT Service Management",
  },
]

type TopbarProps = {
  user: AuthUser
}

export function Topbar({ user }: TopbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const active = topbarConfig.find((item) => item.match(pathname))
  const parent = active?.parent ?? "Workspace"
  const current = active?.current ?? "Dashboard"
  const title = active?.title ?? "IT Service Management"
  const initials =
    user.name
      .split(" ")
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U"

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[#0072CE]/30 bg-white/95 px-6 shadow-[0_6px_24px_rgba(11,31,58,0.08)] backdrop-blur">
      <div>
        <div className="flex items-center gap-2 text-sm text-[#1E3A6D]">
          <span>{parent}</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>{current}</span>
        </div>
        <h1 className="text-lg font-semibold text-[#0B1F3A]">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden w-72 items-center gap-2 rounded-md border border-[#0072CE]/25 bg-[#0072CE]/5 px-3 md:flex">
          <Search className="h-4 w-4 text-[#1E3A6D]" />
          <Input
            type="search"
            placeholder="Search tickets, users, assets"
            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <Button variant="outline" size="icon" className="relative border-[#0072CE]/30 bg-white text-[#1E3A6D] hover:bg-[#0072CE]/10">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#D71920]" />
        </Button>

        <Button
          variant="outline"
          className="hidden border-[#0072CE]/30 bg-white text-[#1E3A6D] hover:bg-[#0072CE]/10 sm:inline-flex"
          onClick={() => {
            clearUserSession()
            router.push("/login")
          }}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>

        <div className="flex items-center gap-2 rounded-lg border border-[#0072CE]/30 bg-white px-2 py-1.5">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-[#0B1F3A] text-xs font-semibold text-white">{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden text-left md:block">
            <p className="text-sm font-medium text-[#0B1F3A]">{user.name}</p>
            <p className="text-xs text-[#1E3A6D]">{getRoleLabel(user.role)}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
