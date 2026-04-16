"use client"

import { Bell, ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getTicketDetailPathByRole, type AuthUser } from "@/lib/auth"
import {
  getNotifications,
  markNotificationRead,
  type AppNotification,
} from "@/lib/api"

const topbarConfig: Array<{
  match: (pathname: string) => boolean
  parent: string
  current: string
  title: string
}> = [
  {
    match: (pathname) => pathname.startsWith("/employee/profile"),
    parent: "Employee",
    current: "Profile",
    title: "Employee Profile",
  },
  {
    match: (pathname) => pathname.startsWith("/employee/report"),
    parent: "Employee",
    current: "Report Fault",
    title: "Employee Fault Reporting",
  },
  {
    match: (pathname) => pathname.startsWith("/employee/tickets/"),
    parent: "Employee",
    current: "Ticket Detail",
    title: "Ticket Conversation",
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
    match: (pathname) => pathname.startsWith("/technician/hardware-request"),
    parent: "Technician",
    current: "Office Asset Request",
    title: "Consumable Request Form",
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
    match: (pathname) => pathname.startsWith("/admin-fault/tickets/"),
    parent: "Admin Fault",
    current: "Ticket Detail",
    title: "Fault Ticket Workspace",
  },
  {
    match: (pathname) => pathname.startsWith("/admin-fault/tickets"),
    parent: "Admin Fault",
    current: "All Tickets",
    title: "Fault Control Center",
  },
  {
    match: (pathname) => pathname.startsWith("/admin-fault/performance"),
    parent: "Admin Fault",
    current: "Performance",
    title: "Performance Analytics",
  },
  {
    match: (pathname) => pathname.startsWith("/admin-fault/log-call"),
    parent: "Admin Fault",
    current: "Log Call",
    title: "Call Logging",
  },
  {
    match: (pathname) => pathname.startsWith("/admin-fault/manage-users"),
    parent: "Admin Fault",
    current: "Manage Users",
    title: "User Management",
  },
  {
    match: (pathname) => pathname === "/admin-fault/dashboard",
    parent: "Admin Fault",
    current: "Dashboard",
    title: "Fault Management Console",
  },
  {
    match: (pathname) => pathname.startsWith("/manager/tickets/"),
    parent: "Manager",
    current: "Ticket Detail",
    title: "Manager Ticket Conversation",
  },
  {
    match: (pathname) => pathname.startsWith("/manager/tickets"),
    parent: "Manager",
    current: "Ticket Oversight",
    title: "Manager Ticket Oversight",
  },
  {
    match: (pathname) => pathname.startsWith("/manager/performance"),
    parent: "Manager",
    current: "Performance",
    title: "Manager Performance Analytics",
  },
  {
    match: (pathname) => pathname.startsWith("/manager/resources"),
    parent: "Manager",
    current: "Resource Oversight",
    title: "Manager Resource Oversight",
  },
  {
    match: (pathname) => pathname === "/manager/dashboard",
    parent: "Manager",
    current: "Dashboard",
    title: "Manager Command Center",
  },
  {
    match: (pathname) => pathname.startsWith("/admin-consumables/tickets/"),
    parent: "Admin Consumables",
    current: "Ticket Detail",
    title: "Ticket Collaboration",
  },
  {
    match: (pathname) => pathname.startsWith("/admin-consumables/inventory"),
    parent: "Admin Consumables",
    current: "Assets",
    title: "Assets Inventory",
  },
  {
    match: (pathname) => pathname.startsWith("/admin-consumables/returns"),
    parent: "Admin Consumables",
    current: "Returns",
    title: "Consumable Return History",
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
    current: "+ Asset",
    title: "Add New Asset",
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

function formatNotificationType(type: AppNotification["type"]): string {
  if (type === "MENTION") {
    return "Mention"
  }
  if (type === "REPLY") {
    return "Reply"
  }
  if (type === "DISCUSSION") {
    return "Discussion"
  }
  return "System"
}

function notificationBadgeClass(type: AppNotification["type"]): string {
  if (type === "MENTION") {
    return "border-[#9FC5EA] bg-[#EAF5FF] text-[#1F4E7A]"
  }
  if (type === "REPLY") {
    return "border-[#9CD8C2] bg-[#EAF8F0] text-[#176B4A]"
  }
  if (type === "DISCUSSION") {
    return "border-[#E5D2AB] bg-[#FFF9EC] text-[#7A5700]"
  }
  return "border-slate-200 bg-slate-50 text-slate-700"
}

export function Topbar({ user }: TopbarProps) {
  const pathname = usePathname() ?? ""
  const router = useRouter()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const active = topbarConfig.find((item) => item.match(pathname))
  const parent = active?.parent ?? "Workspace"
  const current = active?.current ?? "Dashboard"
  const supportsNotifications =
    user.role === "employee" ||
    user.role === "technician" ||
    user.role === "admin_fault" ||
    user.role === "admin_consumables" ||
    user.role === "manager"

  const loadNotifications = async () => {
    if (!supportsNotifications) {
      return
    }
    try {
      const payload = await getNotifications()
      setNotifications(payload.notifications)
      setUnreadCount(payload.unread_count)
    } catch {
      // Keep topbar resilient if notifications API is temporarily unavailable.
    }
  }

  useEffect(() => {
    void loadNotifications()
    if (!supportsNotifications) {
      return
    }

    const intervalId = window.setInterval(() => {
      void loadNotifications()
    }, 10000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [supportsNotifications, user.role])

  const handleNotificationSelect = async (item: AppNotification) => {
    if (!item.is_read) {
      setNotifications((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.id === item.id ? { ...currentItem, is_read: true } : currentItem
        )
      )
      setUnreadCount((currentValue) => Math.max(currentValue - 1, 0))

      try {
        await markNotificationRead(item.id)
      } catch {
        void loadNotifications()
      }
    }

    if (item.ticket_id) {
      const ticketPath = getTicketDetailPathByRole(user.role, item.ticket_id)
      const shouldOpenConversation =
        Boolean(item.ticket_message_id) || item.type === "MENTION" || item.type === "REPLY" || item.type === "DISCUSSION"
      router.push(shouldOpenConversation ? `${ticketPath}#conversation-section` : ticketPath)
    }
  }

  return (
    <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-[#D71920]/70 bg-gradient-to-r from-[#7A0000]/95 via-[#A50000]/95 to-[#D71920]/95 px-6 py-2 shadow-[0_8px_24px_rgba(122,0,0,0.28)] backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="rounded-lg border border-white/30 bg-white/12 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <span className="tracking-wide">{parent}</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="tracking-wide">{current}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {supportsNotifications ? (
          <DropdownMenu onOpenChange={(open) => (open ? void loadNotifications() : undefined)}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="relative border-white/35 bg-white/12 text-white hover:border-white hover:bg-white hover:text-[#8E0000] data-[state=open]:border-white data-[state=open]:bg-white data-[state=open]:text-[#8E0000]"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-white px-1 text-[10px] font-semibold text-[#B00000]">
                    {unreadCount}
                  </span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[22rem] max-w-[92vw]">
              {notifications.length === 0 ? (
                <DropdownMenuItem disabled>No notifications yet.</DropdownMenuItem>
              ) : (
                notifications.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    className="block cursor-pointer whitespace-normal rounded-md px-3 py-3"
                    onSelect={() => {
                      void handleNotificationSelect(item)
                    }}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge className={notificationBadgeClass(item.type)}>
                          {formatNotificationType(item.type)}
                        </Badge>
                        {!item.is_read ? (
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#0A63B8]">
                            New
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm leading-6 text-slate-800">{item.message}</p>
                      <p className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                      {item.ticket_id ? (
                        <p className="text-xs font-medium text-[#0A63B8]">
                          Open ticket conversation
                        </p>
                      ) : null}
                    </div>
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
