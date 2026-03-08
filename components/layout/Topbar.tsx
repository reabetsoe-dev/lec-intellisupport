"use client"

import { Bell, ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { type AuthUser } from "@/lib/auth"
import { getNotifications, markNotificationsRead, type AppNotification } from "@/lib/api"

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
    title: "Employee Fault Reporting",
  },
  {
    match: (pathname) => pathname.startsWith("/employee/tickets"),
    parent: "Employee",
    current: "My Tickets",
    title: "Employee Ticket History",
  },
  {
    match: (pathname) => pathname.startsWith("/employee/my-consumables"),
    parent: "Employee",
    current: "My Consumables",
    title: "Assigned Consumables",
  },
  {
    match: (pathname) => pathname.startsWith("/employee/consumables"),
    parent: "Employee",
    current: "Consumable Request",
    title: "Consumable Request Form",
  },
  {
    match: (pathname) => pathname === "/employee/dashboard",
    parent: "Employee",
    current: "Dashboard",
    title: "Employee Dashboard",
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
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const active = topbarConfig.find((item) => item.match(pathname))
  const parent = active?.parent ?? "Workspace"
  const current = active?.current ?? "Dashboard"
  const supportsNotifications = user.role === "technician" || user.role === "admin_fault"

  useEffect(() => {
    if (!supportsNotifications) {
      setNotifications([])
      setUnreadCount(0)
      return
    }

    const load = async () => {
      try {
        const payload = await getNotifications(user.id)
        setNotifications(payload.notifications)
        setUnreadCount(payload.unread_count)
      } catch {
        // Keep topbar resilient if notifications API is temporarily unavailable.
      }
    }

    void load()
    const intervalId = window.setInterval(() => {
      void load()
    }, 10000)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [supportsNotifications, user.id])

  const handleOpenNotifications = async () => {
    if (!supportsNotifications) {
      return
    }
    try {
      const payload = await getNotifications(user.id)
      setNotifications(payload.notifications)
      setUnreadCount(payload.unread_count)
      if (payload.unread_count > 0) {
        const markResult = await markNotificationsRead(user.id)
        setUnreadCount(markResult.unread_count)
        setNotifications((currentItems) => currentItems.map((item) => ({ ...item, is_read: true })))
      }
    } catch {
      // Ignore transient errors from notifications refresh.
    }
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[#0072CE]/30 bg-white/95 px-6 shadow-[0_6px_24px_rgba(11,31,58,0.08)] backdrop-blur">
      <div className="rounded-lg border border-[#0072CE]/25 bg-[#F7FBFF] px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-[#0B1F3A]">
          <span className="tracking-wide">{parent}</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="tracking-wide">{current}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {supportsNotifications ? (
          <DropdownMenu onOpenChange={(open) => (open ? void handleOpenNotifications() : undefined)}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="relative border-[#0072CE]/30 bg-white text-[#1E3A6D] hover:bg-[#0072CE]/10">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#D71920] px-1 text-[10px] font-semibold text-white">
                    {unreadCount}
                  </span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              {notifications.length === 0 ? (
                <DropdownMenuItem disabled>No notifications yet.</DropdownMenuItem>
              ) : (
                notifications.map((item) => (
                  <DropdownMenuItem key={item.id} className="block cursor-default whitespace-normal">
                    <p className="text-sm text-slate-800">{item.message}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  )
}
