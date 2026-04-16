"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { escalateTicket, getTechnicians, getTicketById, type Technician, type TicketDetail, updateTicketStatus } from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"
import { useAutoRefresh } from "@/lib/use-auto-refresh"

function normalizeTicketStatus(status: string): string {
  const normalized = status.trim().toLowerCase()
  if (normalized === "open" || normalized === "pending vendor" || normalized === "pending") {
    return "Pending"
  }
  if (normalized === "escalated" || normalized === "in progress" || normalized === "in process") {
    return "In Progress"
  }
  if (normalized === "pending review" || normalized === "awaiting review") {
    return "Pending Review"
  }
  if (normalized === "resolved" || normalized === "solved") {
    return "Solved"
  }
  return status
}

function formatTrackingId(id: number): string {
  return `TK-${String(id).padStart(5, "0")}`
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "N/A"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "N/A"
  }
  return date.toLocaleString()
}

function formatElapsedTime(value?: string | null): string {
  if (!value) {
    return "N/A"
  }
  const created = new Date(value)
  if (Number.isNaN(created.getTime())) {
    return "N/A"
  }

  const deltaMs = Math.max(Date.now() - created.getTime(), 0)
  const totalMinutes = Math.floor(deltaMs / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) {
    return `${days}d ${hours}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
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

function statusBadgeClass(status: string): string {
  if (status === "Pending") {
    return "border-[#E1BF7A] bg-[#FFF6DF] text-[#8A5A00]"
  }
  if (status === "In Progress") {
    return "border-[#9EC2E7] bg-[#E9F3FF] text-[#1F4E7A]"
  }
  if (status === "Pending Review") {
    return "border-[#E8C999] bg-[#FFF7E8] text-[#8A5A00]"
  }
  return "border-[#8DC8A6] bg-[#E8F8EF] text-[#1E6A40]"
}

function priorityBadgeClass(priority: string): string {
  const normalized = priority.trim().toLowerCase()
  if (normalized === "critical") {
    return "border-[#F0A8A8] bg-[#FFEAEA] text-[#A13030]"
  }
  if (normalized === "high") {
    return "border-[#F3CA8D] bg-[#FFF4DD] text-[#996100]"
  }
  if (normalized === "medium") {
    return "border-[#95D6BF] bg-[#E5F8F1] text-[#176B4A]"
  }
  return "border-[#A8C7E5] bg-[#EAF3FC] text-[#285D8D]"
}

function commentTone(commentText: string): string {
  const normalized = commentText.trim().toLowerCase()
  if (normalized.startsWith("escalated")) {
    return "border-[#E6C99A] bg-[#FFF7EA]"
  }
  if (normalized.includes("accepted")) {
    return "border-[#9FC6EA] bg-[#EEF6FF]"
  }
  if (normalized.includes("solved") || normalized.includes("approved")) {
    return "border-[#9ED4B6] bg-[#EEF9F3]"
  }
  return "border-slate-200 bg-slate-50"
}

function workflowHint(status: string): string {
  if (status === "Pending") {
    return "Awaiting technician acceptance. Click Accept to start work and notify the reporter."
  }
  if (status === "In Progress") {
    return "Actively being handled. Click Solved when fix is completed and ready for reporter review."
  }
  if (status === "Pending Review") {
    return "Waiting for reporter rating/review before final closure."
  }
  return "Ticket is closed after reporter confirmation."
}

type TechnicianTicketDetailWorkspaceProps = {
  ticketId: number
}

export function TechnicianTicketDetailWorkspace({ ticketId }: TechnicianTicketDetailWorkspaceProps) {
  const router = useRouter()
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [escalationDialogOpen, setEscalationDialogOpen] = useState(false)
  const [escalationTarget, setEscalationTarget] = useState("")
  const [escalationComment, setEscalationComment] = useState("")
  const [resultDialog, setResultDialog] = useState<{
    open: boolean
    status: "success" | "error"
    message: string
  }>({
    open: false,
    status: "success",
    message: "",
  })

  const currentUser = getStoredUserSession()
  const currentUserId = currentUser?.id

  const showResultDialog = (status: "success" | "error", message: string) => {
    setResultDialog({
      open: true,
      status,
      message,
    })
  }

  const loadAll = useCallback(async () => {
    if (!currentUserId) {
      throw new Error("Session expired. Please login again.")
    }

    const [ticketData, technicianData] = await Promise.all([
      getTicketById(ticketId, { technicianUserId: currentUserId }),
      getTechnicians(),
    ])
    setTicket(ticketData)
    setTechnicians(technicianData.filter((item) => item.user_id !== currentUserId && item.is_available))
    setLoadError("")
  }, [ticketId, currentUserId])

  useEffect(() => {
    const run = async () => {
      try {
        await loadAll()
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load ticket details.")
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [loadAll])

  useAutoRefresh(loadAll, {
    enabled: Boolean(currentUserId) && !loading && !actionLoading,
    intervalMs: 10000,
  })

  const detailStatus = ticket ? normalizeTicketStatus(ticket.status) : "Pending"
  const timelineItems = useMemo(() => ticket?.comments ?? [], [ticket])

  const handleStatusUpdate = async (nextStatus: "In Progress" | "Solved") => {
    if (!ticket || !currentUser) {
      return
    }
    try {
      setActionLoading(true)
      await updateTicketStatus(ticket.id, nextStatus, undefined, currentUser.id)
      await loadAll()
      showResultDialog(
        "success",
        nextStatus === "In Progress"
          ? "Ticket accepted. Reporter has been notified that work is in progress."
          : "Ticket marked solved and sent for reporter review/rating."
      )
    } catch (error) {
      showResultDialog("error", error instanceof Error ? error.message : "Failed to update status.")
    } finally {
      setActionLoading(false)
    }
  }

  const handleEscalate = async () => {
    if (!ticket || !currentUser) {
      return
    }
    if (!escalationTarget) {
      showResultDialog("error", "Choose the technician to escalate to.")
      return
    }
    if (!escalationComment.trim()) {
      showResultDialog("error", "Escalation comment is required.")
      return
    }
    try {
      setActionLoading(true)
      await escalateTicket(ticket.id, currentUser.id, Number(escalationTarget), escalationComment.trim())
      setEscalationComment("")
      setEscalationTarget("")
      setEscalationDialogOpen(false)
      showResultDialog("success", "Ticket escalated successfully. Reporter has been notified.")
      router.push("/technician/tickets")
    } catch (error) {
      showResultDialog("error", error instanceof Error ? error.message : "Failed to escalate ticket.")
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading ticket details...</p>
  }

  if (loadError) {
    return <p className="text-sm text-rose-600">{loadError}</p>
  }

  if (!ticket) {
    return <p className="text-sm text-rose-600">Ticket not found.</p>
  }

  const reporterName = ticket.employee_name ?? `Employee #${ticket.employee_id}`
  const currentOwner = ticket.technician_name ?? "Unassigned"

  return (
    <div className="space-y-6">
      <Card className="rounded-xl border-[#B4C9DD] bg-[#F8FBFF] py-0 shadow-sm">
        <CardHeader className="border-b border-[#D4E1EE] px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wide text-[#486D90] uppercase">{formatTrackingId(ticket.id)}</p>
              <CardTitle className="mt-1 text-2xl font-semibold text-[#173A5E]">{ticket.title}</CardTitle>
              <p className="mt-2 text-sm text-[#4D6D8E]">{workflowHint(detailStatus)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className={`rounded-sm border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(detailStatus)}`}>
                Status: {detailStatus}
              </Badge>
              <Badge className={`rounded-sm border px-2 py-0.5 text-xs font-semibold ${priorityBadgeClass(ticket.priority)}`}>
                Priority: {ticket.priority}
              </Badge>
              <Badge variant="outline" className="border-[#AFC6DC] bg-white text-[#355A80]">
                Category: {ticket.category}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 px-6 py-5 text-sm text-[#365C81] md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-[#D7E3EF] bg-white p-3">
            <p className="text-xs font-medium text-[#6A87A4]">Reporter</p>
            <p className="mt-1 font-semibold text-[#21476D]">{reporterName}</p>
          </div>
          <div className="rounded-lg border border-[#D7E3EF] bg-white p-3">
            <p className="text-xs font-medium text-[#6A87A4]">Assigned Technician</p>
            <p className="mt-1 font-semibold text-[#21476D]">{currentOwner}</p>
          </div>
          <div className="rounded-lg border border-[#D7E3EF] bg-white p-3">
            <p className="text-xs font-medium text-[#6A87A4]">Created</p>
            <p className="mt-1 font-semibold text-[#21476D]">{formatDateTime(ticket.created_at)}</p>
            <p className="mt-1 text-xs text-[#6784A0]">Age: {formatElapsedTime(ticket.created_at)}</p>
          </div>
          <div className="rounded-lg border border-[#D7E3EF] bg-white p-3">
            <p className="text-xs font-medium text-[#6A87A4]">Last Updated</p>
            <p className="mt-1 font-semibold text-[#21476D]">{formatDateTime(ticket.updated_at)}</p>
          </div>
          <div className="rounded-lg border border-[#D7E3EF] bg-white p-3">
            <p className="text-xs font-medium text-[#6A87A4]">Location / Branch</p>
            <p className="mt-1 font-semibold text-[#21476D]">{ticket.location || "N/A"}</p>
          </div>
          <div className="rounded-lg border border-[#D7E3EF] bg-white p-3">
            <p className="text-xs font-medium text-[#6A87A4]">Caller Name</p>
            <p className="mt-1 font-semibold text-[#21476D]">{ticket.caller_name || reporterName}</p>
          </div>
          <div className="rounded-lg border border-[#D7E3EF] bg-white p-3">
            <p className="text-xs font-medium text-[#6A87A4]">Logged By</p>
            <p className="mt-1 font-semibold text-[#21476D]">{ticket.logged_by_admin_name || "Self Service"}</p>
          </div>
          <div className="rounded-lg border border-[#D7E3EF] bg-white p-3">
            <p className="text-xs font-medium text-[#6A87A4]">Reporter Confirmed Details</p>
            <p className="mt-1 font-semibold text-[#21476D]">{ticket.reporter_reviewed_problem ? "Yes" : "No"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.9fr_1.1fr]">
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Problem Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6 text-sm text-slate-700">
            <p className="leading-7 whitespace-pre-wrap">{ticket.description || "No detailed description provided."}</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-[#C8D7E8] bg-[#F6FAFF] py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-[#1E446A]">Technician Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6 text-sm text-[#3A6288]">
            <div className="flex flex-wrap gap-2">
              <Button
                className="bg-[#1E5EA5] text-white hover:bg-[#174D87]"
                disabled={actionLoading || detailStatus !== "Pending"}
                onClick={() => void handleStatusUpdate("In Progress")}
              >
                {actionLoading ? "Saving..." : "Accept"}
              </Button>
              <Button
                className="bg-[#1E7A45] text-white hover:bg-[#18643A]"
                disabled={actionLoading || detailStatus !== "In Progress"}
                onClick={() => void handleStatusUpdate("Solved")}
              >
                {actionLoading ? "Saving..." : "Solved"}
              </Button>
              <Button
                variant="outline"
                className="border-[#C89A4D] bg-white text-[#8B5A12]"
                disabled={actionLoading || detailStatus === "Pending Review" || detailStatus === "Solved"}
                onClick={() => setEscalationDialogOpen(true)}
              >
                Escalate
              </Button>
            </div>
            <p>
              Accept notifies reporter that work is in progress. Solved sends the ticket for reporter rating/review.
              Escalate transfers ownership to another technician.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">Ticket Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-6 pb-6">
          {timelineItems.length === 0 ? (
            <p className="text-sm text-slate-500">No timeline activity yet.</p>
          ) : (
            timelineItems.map((item) => (
              <div key={item.id} className={`rounded-lg border p-4 text-sm ${commentTone(item.comment)}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">{item.author_name}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(item.created_at)}</p>
                </div>
                <p className="mt-2 leading-6 text-slate-700">{formatTicketCommentText(item.comment, item.author_name)}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={escalationDialogOpen} onOpenChange={setEscalationDialogOpen}>
        <DialogContent className="border-[#9CB8D3] bg-[#F7FBFF]">
          <DialogHeader>
            <DialogTitle className="text-[#1D3F63]">Escalate Ticket #{ticket.id}</DialogTitle>
            <DialogDescription className="text-[#4A6887]">Choose technician and provide escalation notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Target Technician</label>
              <select
                className="h-10 w-full rounded-md border border-[#B7CBE0] bg-white px-3 text-sm text-slate-800"
                value={escalationTarget}
                onChange={(event) => setEscalationTarget(event.target.value)}
              >
                <option value="">Select technician</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={String(tech.id)}>
                    {tech.name} ({tech.skillset})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Escalation Notes</label>
              <textarea
                className="min-h-24 w-full rounded-md border border-[#B7CBE0] bg-white px-3 py-2 text-sm text-slate-800"
                placeholder="Explain why this ticket is being escalated."
                value={escalationComment}
                onChange={(event) => setEscalationComment(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEscalationDialogOpen(false)
                setEscalationTarget("")
                setEscalationComment("")
              }}
            >
              Cancel
            </Button>
            <Button type="button" className="bg-[#204B73] text-white hover:bg-[#173754]" onClick={() => void handleEscalate()}>
              {actionLoading ? "Escalating..." : "Submit Escalation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActionFeedbackDialog
        open={resultDialog.open}
        status={resultDialog.status}
        message={resultDialog.message}
        onOk={() => setResultDialog((current) => ({ ...current, open: false }))}
      />
    </div>
  )
}
