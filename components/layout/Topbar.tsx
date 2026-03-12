"use client"

import { Bell, ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { type AuthUser } from "@/lib/auth"
import {
  escalateTicket,
  getNotifications,
  getTechnicians,
  getTicketById,
  markNotificationsRead,
  type AppNotification,
  type Technician,
  type TicketDetail,
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

function extractEscalationReason(commentText: string): string {
  const separatorIndex = commentText.indexOf(":")
  if (separatorIndex < 0) {
    return ""
  }
  return commentText.slice(separatorIndex + 1).trim()
}

function formatTicketCommentText(commentText: string, authorName: string): string {
  const trimmed = commentText.trim()
  const normalized = trimmed.toLowerCase()
  if (normalized.startsWith("escalated to technician") || normalized.startsWith("escalated to admin fault")) {
    const reason = extractEscalationReason(trimmed)
    return reason ? `Escalated by ${authorName}: ${reason}` : `Escalated by ${authorName}`
  }
  return commentText
}

export function Topbar({ user }: TopbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [ticketDetailOpen, setTicketDetailOpen] = useState(false)
  const [ticketDetailLoading, setTicketDetailLoading] = useState(false)
  const [ticketDetailError, setTicketDetailError] = useState("")
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [escalationTarget, setEscalationTarget] = useState("")
  const [escalationComment, setEscalationComment] = useState("")
  const [escalationLoading, setEscalationLoading] = useState(false)
  const [escalationError, setEscalationError] = useState("")
  const [escalationSuccess, setEscalationSuccess] = useState("")
  const active = topbarConfig.find((item) => item.match(pathname))
  const parent = active?.parent ?? "Workspace"
  const current = active?.current ?? "Dashboard"
  const supportsNotifications =
    user.role === "employee" || user.role === "technician" || user.role === "admin_fault"

  useEffect(() => {
    if (!supportsNotifications) {
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

  const openTicketDetailsFromNotification = async (ticketId: number) => {
    setTicketDetailOpen(true)
    setTicketDetailLoading(true)
    setTicketDetailError("")
    setEscalationError("")
    setEscalationSuccess("")
    setEscalationTarget("")
    setEscalationComment("")
    setSelectedTicket(null)
    try {
      if (user.role === "technician") {
        const [ticketPayload, technicianPayload] = await Promise.all([getTicketById(ticketId), getTechnicians()])
        setSelectedTicket(ticketPayload)
        setTechnicians(technicianPayload)
      } else {
        const payload = await getTicketById(ticketId)
        setSelectedTicket(payload)
      }
    } catch (loadError) {
      setTicketDetailError(loadError instanceof Error ? loadError.message : "Failed to load ticket details.")
    } finally {
      setTicketDetailLoading(false)
    }
  }

  const handleEscalateFromNotification = async () => {
    if (user.role !== "technician" || !selectedTicket) {
      return
    }

    const currentTechnician = technicians.find((item) => item.user_id === user.id)
    if (!currentTechnician || selectedTicket.technician_id !== currentTechnician.id) {
      setEscalationError("Only the current owner can escalate this ticket.")
      return
    }

    if (!escalationTarget) {
      setEscalationError("Select where you want to escalate this ticket.")
      return
    }

    if (!escalationComment.trim()) {
      setEscalationError("Escalation comment is required.")
      return
    }

    let targetTechnicianId: number | null = null
    let targetRole: "admin_fault" | undefined

    if (escalationTarget === "admin_fault") {
      targetRole = "admin_fault"
    } else {
      const parsed = Number(escalationTarget)
      if (!Number.isFinite(parsed)) {
        setEscalationError("Invalid escalation target.")
        return
      }
      targetTechnicianId = parsed
    }

    try {
      setEscalationLoading(true)
      setEscalationError("")
      setEscalationSuccess("")
      await escalateTicket(selectedTicket.id, user.id, targetTechnicianId, escalationComment.trim(), targetRole)
      const [refreshedTicket, notificationPayload] = await Promise.all([getTicketById(selectedTicket.id), getNotifications(user.id)])
      setSelectedTicket(refreshedTicket)
      setNotifications(notificationPayload.notifications)
      setUnreadCount(notificationPayload.unread_count)
      setEscalationTarget("")
      setEscalationComment("")
      setEscalationSuccess("Ticket escalated successfully.")
    } catch (escalateError) {
      setEscalationError(escalateError instanceof Error ? escalateError.message : "Failed to escalate ticket.")
    } finally {
      setEscalationLoading(false)
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
        {user.role === "employee" ? (
          <Button
            variant="outline"
            className="border-[#0072CE]/30 bg-white text-[#1E3A6D] hover:bg-[#0072CE]/10"
            onClick={() => router.push("/employee/profile")}
          >
            {user.name}
          </Button>
        ) : null}
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
                  <DropdownMenuItem
                    key={item.id}
                    className={`block whitespace-normal ${item.ticket_id ? "cursor-pointer" : "cursor-default"}`}
                    onClick={() => {
                      if (item.ticket_id) {
                        void openTicketDetailsFromNotification(item.ticket_id)
                      }
                    }}
                  >
                    <p className="text-sm text-slate-800">{item.message}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                    {item.ticket_id ? <p className="mt-1 text-xs text-[#005DA8]">Click to view full ticket details</p> : null}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <Dialog open={ticketDetailOpen} onOpenChange={setTicketDetailOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedTicket ? `Ticket #${selectedTicket.id} Details` : "Ticket Details"}
            </DialogTitle>
          </DialogHeader>

          {ticketDetailLoading ? (
            <p className="text-sm text-slate-500">Loading ticket details...</p>
          ) : ticketDetailError ? (
            <p className="text-sm text-rose-600">{ticketDetailError}</p>
          ) : selectedTicket ? (
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{selectedTicket.title}</h3>
                <p className="mt-1 text-slate-700">{selectedTicket.description}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Category: {selectedTicket.category}</Badge>
                <Badge variant="outline">Priority: {selectedTicket.priority}</Badge>
                <Badge variant="outline">Status: {selectedTicket.status}</Badge>
                <Badge variant="outline">Reporter: {selectedTicket.employee_name ?? selectedTicket.employee_id}</Badge>
                <Badge variant="outline">Assigned: {selectedTicket.technician_name ?? "Admin Fault Queue"}</Badge>
                <Badge variant="outline">Branch: {selectedTicket.location || "N/A"}</Badge>
                <Badge variant="outline">Reported: {selectedTicket.created_at ? new Date(selectedTicket.created_at).toLocaleString() : "N/A"}</Badge>
                <Badge variant="outline">Updated: {selectedTicket.updated_at ? new Date(selectedTicket.updated_at).toLocaleString() : "N/A"}</Badge>
              </div>

              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">Comments</p>
                {selectedTicket.comments.length === 0 ? (
                  <p className="text-xs text-slate-500">No comments yet.</p>
                ) : (
                  selectedTicket.comments.map((comment) => (
                    <div key={comment.id} className="rounded-md border border-slate-200 bg-white p-2">
                      <p className="text-xs font-semibold text-slate-800">{comment.author_name}</p>
                      <p className="text-xs text-slate-700">{formatTicketCommentText(comment.comment, comment.author_name)}</p>
                      <p className="text-[11px] text-slate-500">{new Date(comment.created_at).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>

              {user.role === "technician" ? (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-800">Escalate Ticket</p>
                  <select
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
                    value={escalationTarget}
                    onChange={(event) => setEscalationTarget(event.target.value)}
                    disabled={escalationLoading}
                  >
                    <option value="">Select escalation target</option>
                    {technicians
                      .filter((item) => item.user_id !== user.id)
                      .map((item) => (
                        <option key={item.id} value={String(item.id)}>
                          {item.name}
                        </option>
                      ))}
                    <option value="admin_fault">Back to Admin Fault</option>
                  </select>
                  <textarea
                    className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800"
                    placeholder="Explain why this ticket is being escalated."
                    value={escalationComment}
                    onChange={(event) => setEscalationComment(event.target.value)}
                    disabled={escalationLoading}
                  />
                  {escalationError ? <p className="text-xs text-rose-600">{escalationError}</p> : null}
                  {escalationSuccess ? <p className="text-xs text-emerald-700">{escalationSuccess}</p> : null}
                  <Button type="button" onClick={() => void handleEscalateFromNotification()} disabled={escalationLoading}>
                    {escalationLoading ? "Escalating..." : "Escalate Now"}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a ticket notification to view details.</p>
          )}

          <DialogFooter>
            {selectedTicket && user.role === "technician" ? (
              <Button onClick={() => router.push(`/technician/tickets/${selectedTicket.id}`)}>
                Open Technician Workbench
              </Button>
            ) : null}
            {selectedTicket && user.role === "admin_fault" ? (
              <Button variant="outline" onClick={() => router.push("/admin-fault/tickets")}>
                Open Admin Ticket Queue
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}
