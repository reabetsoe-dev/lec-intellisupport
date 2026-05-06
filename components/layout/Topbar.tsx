"use client"

import { Bell, ChevronRight, ExternalLink, Volume2, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getTicketDetailPathByRole, type AuthUser } from "@/lib/auth"
import {
  getTicketById,
  getNotifications,
  markNotificationsRead,
  markNotificationRead,
  type AppNotification,
  updateTicketStatus,
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
    match: (pathname) => pathname.startsWith("/admin-fault/technician-access"),
    parent: "Admin Fault",
    current: "Technician QR",
    title: "Technician QR Access",
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

type NotificationPriority = "Critical" | "Action Required" | "Info"
type NotificationCategory = "Action Required" | "Assigned to You" | "Messages" | "Completed"

type ToastNotification = {
  id: string
  notificationId: number | null
  title: string
  message: string
  priority: NotificationPriority
  actionLabel: string
  ticketId: number | null
  ticketMessageId: number | null
  sticky: boolean
  expiresAt: number | null
}

function resolveNotificationPriority(item: AppNotification): NotificationPriority {
  if (item.priority === "Critical" || item.priority === "Action Required" || item.priority === "Info") {
    return item.priority
  }
  const message = String(item.message || "").toLowerCase()
  if (message.includes("critical") || message.includes("urgent") || message.includes("sla breach")) {
    return "Critical"
  }
  if (message.includes("assigned") || message.includes("pending review") || message.includes("awaiting")) {
    return "Action Required"
  }
  return "Info"
}

function resolveNotificationCategory(item: AppNotification): NotificationCategory {
  if (
    item.category === "Action Required" ||
    item.category === "Assigned to You" ||
    item.category === "Messages" ||
    item.category === "Completed"
  ) {
    return item.category
  }
  const message = String(item.message || "").toLowerCase()
  if (message.includes("assigned to you")) return "Assigned to You"
  if (message.includes("pending review") || message.includes("requires your review")) return "Action Required"
  if (message.includes("solved") || message.includes("resolved") || message.includes("completed")) return "Completed"
  return "Messages"
}

function priorityBadgeClass(priority: NotificationPriority): string {
  if (priority === "Critical") {
    return "border-[#F4B5B5] bg-[#FFE5E5] text-[#A33939]"
  }
  if (priority === "Action Required") {
    return "border-[#F4D88D] bg-[#FFF5D8] text-[#9A6A00]"
  }
  return "border-[#9CC4EA] bg-[#DDEEFF] text-[#2E6092]"
}

function categoryOrder(category: NotificationCategory): number {
  if (category === "Action Required") return 0
  if (category === "Assigned to You") return 1
  if (category === "Messages") return 2
  return 3
}

export function Topbar({ user }: TopbarProps) {
  const pathname = usePathname() ?? ""
  const router = useRouter()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [toasts, setToasts] = useState<ToastNotification[]>([])
  const [isBellAnimating, setIsBellAnimating] = useState(false)
  const [soundEnabled] = useState(true)
  const knownNotificationIdsRef = useRef<Set<number>>(new Set())
  const hasCompletedInitialLoadRef = useRef(false)
  const bellAnimationTimeoutRef = useRef<number | null>(null)

  const active = topbarConfig.find((item) => item.match(pathname))
  const parent = active?.parent ?? "Workspace"
  const current = active?.current ?? "Dashboard"
  const supportsNotifications =
    user.role === "employee" ||
    user.role === "technician" ||
    user.role === "admin_fault" ||
    user.role === "admin_consumables" ||
    user.role === "manager"

  const playCriticalSound = useCallback(() => {
    if (!soundEnabled || typeof window === "undefined") {
      return
    }
    try {
      const audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)()
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      oscillator.type = "sine"
      oscillator.frequency.value = 880
      gain.gain.value = 0.06
      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.18)
      oscillator.onended = () => void audioContext.close()
    } catch {
      // Optional sound fallback should never break UI behavior.
    }
  }, [soundEnabled])

  const enqueueToast = useCallback(
    (item: AppNotification) => {
      const priority = resolveNotificationPriority(item)
      const sticky = item.sticky === true || priority === "Critical"
      const duration = priority === "Action Required" ? 10000 : 8000
      const toast: ToastNotification = {
        id: `${item.id}-${Date.now()}`,
        notificationId: item.id,
        title: item.title || (priority === "Critical" ? "Critical Alert" : "New Notification"),
        message: item.message,
        priority,
        actionLabel: item.action_label || "Open Ticket",
        ticketId: item.ticket_id ?? null,
        ticketMessageId: item.ticket_message_id ?? null,
        sticky,
        expiresAt: sticky ? null : Date.now() + duration,
      }
      setToasts((current) => [toast, ...current].slice(0, 5))
      setIsBellAnimating(true)
      if (bellAnimationTimeoutRef.current) {
        window.clearTimeout(bellAnimationTimeoutRef.current)
      }
      bellAnimationTimeoutRef.current = window.setTimeout(() => {
        setIsBellAnimating(false)
      }, 2200)
      if (priority === "Critical") {
        playCriticalSound()
      }
    },
    [playCriticalSound]
  )

  const syncNotifications = useCallback(async () => {
    if (!supportsNotifications) {
      return
    }
    try {
      const payload = await getNotifications()
      setNotifications(payload.notifications)
      setUnreadCount(payload.unread_count)

      const incomingIds = new Set(payload.notifications.map((item) => item.id))
      if (!hasCompletedInitialLoadRef.current) {
        knownNotificationIdsRef.current = incomingIds
        hasCompletedInitialLoadRef.current = true
        return
      }

      const newUnreadNotifications = payload.notifications.filter(
        (item) => !item.is_read && !knownNotificationIdsRef.current.has(item.id)
      )
      newUnreadNotifications.forEach((item) => enqueueToast(item))
      knownNotificationIdsRef.current = incomingIds
    } catch {
      // Keep topbar resilient if notifications API is temporarily unavailable.
    }
  }, [enqueueToast, supportsNotifications])

  useEffect(() => {
    if (!supportsNotifications) {
      return
    }

    let isMounted = true
    const run = async () => {
      if (!isMounted) return
      await syncNotifications()
    }
    void run()

    const intervalId = window.setInterval(() => {
      void run()
    }, 10000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
      if (bellAnimationTimeoutRef.current) {
        window.clearTimeout(bellAnimationTimeoutRef.current)
      }
    }
  }, [supportsNotifications, syncNotifications])

  useEffect(() => {
    if (toasts.length === 0) {
      return
    }
    const timerId = window.setInterval(() => {
      const now = Date.now()
      setToasts((current) => current.filter((item) => item.expiresAt === null || item.expiresAt > now))
    }, 500)
    return () => window.clearInterval(timerId)
  }, [toasts.length])

  const groupedNotifications = useMemo(() => {
    const groupMap = new Map<NotificationCategory, AppNotification[]>()
    for (const item of notifications) {
      const category = resolveNotificationCategory(item)
      const existing = groupMap.get(category) ?? []
      existing.push(item)
      groupMap.set(category, existing)
    }
    return Array.from(groupMap.entries()).sort((left, right) => categoryOrder(left[0]) - categoryOrder(right[0]))
  }, [notifications])

  const dismissToast = (toastId: string) => {
    setToasts((current) => current.filter((item) => item.id !== toastId))
  }

  const markNotificationAsReadLocal = (notificationId: number) => {
    setNotifications((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === notificationId ? { ...currentItem, is_read: true, is_new: false } : currentItem
      )
    )
    setUnreadCount((currentValue) => Math.max(currentValue - 1, 0))
  }

  const handleNotificationSelect = async (item: AppNotification) => {
    if (!item.is_read) {
      markNotificationAsReadLocal(item.id)

      try {
        await markNotificationRead(item.id)
      } catch {
        void syncNotifications()
      }
    }

    if (user.role === "technician" && item.ticket_id) {
      try {
        const ticket = await getTicketById(item.ticket_id, { technicianUserId: user.id })
        if (normalizeTicketStatus(ticket.status) === "Pending") {
          await updateTicketStatus(item.ticket_id, "In Progress", undefined, user.id)
        }
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : "We could not open that ticket right now."
        setTicketAccessNotice({
          open: true,
          message: isTicketAccessErrorMessage(rawMessage)
            ? "That ticket is no longer assigned to your technician account or it has already moved to another queue. Open your current Assigned Tickets list to continue."
            : "We could not open that technician ticket right now. Please try again from your Assigned Tickets list.",
          redirectPath: "/technician/tickets",
        })
        return
      }
    }

    if (item.ticket_id) {
      const ticketPath = getTicketDetailPathByRole(user.role, item.ticket_id)
      const shouldOpenConversation =
        Boolean(item.ticket_message_id) || item.type === "MENTION" || item.type === "REPLY" || item.type === "DISCUSSION"
      router.push(shouldOpenConversation ? `${ticketPath}#conversation-section` : ticketPath)
    }
  }

  const handleToastAction = async (toast: ToastNotification) => {
    if (toast.notificationId) {
      const selectedNotification = notifications.find((item) => item.id === toast.notificationId)
      if (selectedNotification) {
        await handleNotificationSelect(selectedNotification)
      }
    }
    dismissToast(toast.id)
  }

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((item) => !item.is_read).map((item) => item.id)
    if (unreadIds.length === 0) {
      return
    }
    setNotifications((currentItems) => currentItems.map((item) => ({ ...item, is_read: true, is_new: false })))
    setUnreadCount(0)
    try {
      await markNotificationsRead(undefined, unreadIds)
    } catch {
      void syncNotifications()
    }
  }

  return (
    <header className="sticky top-0 z-10 flex min-h-16 flex-wrap items-center justify-between gap-2 border-b border-[#D71920]/70 bg-gradient-to-r from-[#7A0000]/95 via-[#A50000]/95 to-[#D71920]/95 px-3 py-2 shadow-[0_8px_24px_rgba(122,0,0,0.28)] backdrop-blur sm:px-4 md:px-6">
      <div className="min-w-0 flex-1">
        <div className="inline-flex max-w-full items-center rounded-lg border border-white/30 bg-white/12 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-white">
            <span className="truncate tracking-wide">{parent}</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="truncate tracking-wide">{current}</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {supportsNotifications ? (
          <DropdownMenu onOpenChange={(open) => (open ? void syncNotifications() : undefined)}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`relative border-white/35 bg-white/12 text-white hover:border-white hover:bg-white hover:text-[#8E0000] data-[state=open]:border-white data-[state=open]:bg-white data-[state=open]:text-[#8E0000] ${
                  isBellAnimating ? "animate-pulse" : ""
                }`}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-white px-1 text-[10px] font-semibold text-[#B00000]">
                    {unreadCount}
                  </span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[30rem] max-w-[94vw] p-0">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Notifications</p>
                    <p className="text-xs text-slate-600">{unreadCount} unread</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        void syncNotifications()
                      }}
                    >
                      Refresh
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={unreadCount === 0}
                      onClick={() => {
                        void handleMarkAllRead()
                      }}
                    >
                      Mark all read
                    </Button>
                  </div>
                </div>
              </div>
              <div className="max-h-[30rem] overflow-y-auto p-3">
                {groupedNotifications.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                    No notifications yet.
                  </div>
                ) : (
                  groupedNotifications.map(([category, items]) => (
                    <section key={category} className="mb-4 last:mb-0">
                      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{category}</p>
                      <div className="space-y-2">
                        {items.map((item) => {
                          const priority = resolveNotificationPriority(item)
                          return (
                            <div
                              key={item.id}
                              className={`rounded-xl border p-3 ${
                                !item.is_read || item.is_new
                                  ? "border-[#8FB5DC] bg-[#F2F8FF]"
                                  : "border-slate-200 bg-white"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <Badge className={priorityBadgeClass(priority)}>{priority}</Badge>
                                  <Badge className={notificationBadgeClass(item.type)}>
                                    {formatNotificationType(item.type)}
                                  </Badge>
                                </div>
                                {!item.is_read ? (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[#0A63B8]">Unread</span>
                                ) : null}
                              </div>
                              <p className="mt-2 text-sm font-semibold text-slate-900">
                                {item.title || "Notification"}
                              </p>
                              <p className="mt-1 text-sm leading-5 text-slate-700">{item.message}</p>
                              <div className="mt-3 flex items-center justify-between gap-2">
                                <p className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                                <div className="flex items-center gap-2">
                                  {!item.is_read ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 text-xs"
                                      onClick={() => {
                                        void handleNotificationSelect(item)
                                      }}
                                    >
                                      {item.action_label || "Open Ticket"}
                                    </Button>
                                  ) : null}
                                  {item.ticket_id ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-8 bg-[#0A63B8] text-xs text-white hover:bg-[#084C8C]"
                                      onClick={() => {
                                        void handleNotificationSelect(item)
                                      }}
                                    >
                                      Open Ticket
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {toasts.length > 0 ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[26rem] max-w-[94vw] flex-col gap-3">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-2xl border bg-white p-4 shadow-xl ${
                toast.priority === "Critical"
                  ? "border-[#E37F7F]"
                  : toast.priority === "Action Required"
                    ? "border-[#E6C06D]"
                    : "border-[#9CC4EA]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge className={priorityBadgeClass(toast.priority)}>{toast.priority}</Badge>
                    {toast.priority === "Critical" ? <Volume2 className="h-4 w-4 text-[#A33939]" /> : null}
                  </div>
                  <p className="mt-2 text-base font-semibold text-slate-900">{toast.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{toast.message}</p>
                </div>
                <button
                  type="button"
                  className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Dismiss notification"
                  onClick={() => dismissToast(toast.id)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                {toast.ticketId ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 bg-[#0A63B8] text-white hover:bg-[#084C8C]"
                    onClick={() => {
                      void handleToastAction(toast)
                    }}
                  >
                    {toast.actionLabel}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => dismissToast(toast.id)}>
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </header>
  )
}
