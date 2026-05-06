"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Filter, LoaderCircle } from "lucide-react"

import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { escalateTicket, getAssignedTickets, getTechnicians, type Technician, type Ticket, updateTicketStatus } from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"
import { useAutoRefresh } from "@/lib/use-auto-refresh"
import { cn } from "@/lib/utils"

const statusBadgeStyles: Record<string, string> = {
  Pending: "text-[#B26B00]",
  "In Progress": "text-[#6D3CC4]",
  "Pending Review": "text-[#B26B00]",
  Solved: "text-[#1E7A45]",
}

const priorityBadgeStyles: Record<string, string> = {
  Low: "border-[#9CC4EA] bg-[#DDEEFF] text-[#2E6092] hover:!border-[#9CC4EA] hover:!bg-[#DDEEFF] hover:!text-[#2E6092] hover:!shadow-none",
  Medium: "border-[#93D8C1] bg-[#DDF8EF] text-[#177F5A] hover:!border-[#93D8C1] hover:!bg-[#DDF8EF] hover:!text-[#177F5A] hover:!shadow-none",
  High: "border-[#F4D88D] bg-[#FFF5D8] text-[#9A6A00] hover:!border-[#F4D88D] hover:!bg-[#FFF5D8] hover:!text-[#9A6A00] hover:!shadow-none",
  Critical: "border-[#F4B5B5] bg-[#FFE5E5] text-[#A33939] hover:!border-[#F4B5B5] hover:!bg-[#FFE5E5] hover:!text-[#A33939] hover:!shadow-none",
}

type TicketViewFilter = "all" | "pending" | "in_progress" | "solved"

type EscalationCommentPreview = {
  ticketId: number
  title: string
  comment: string
  by?: string | null
  at?: string | null
}

type ActionDialogState = {
  open: boolean
  status: "success" | "error" | "info"
  message: string
}

type TicketRow = {
  id: number
  trackingId: string
  reporter: string
  title: string
  description: string
  branch: string
  updated: string
  priority: string
  status: string
  escalationTarget: string
  raw: Ticket
}

const filterOptions: { key: TicketViewFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In Progress" },
  { key: "solved", label: "Solved" },
]

function formatDateLabel(value?: string | null): string {
  if (!value) {
    return "N/A"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "N/A"
  }
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "N/A"
  }
  return new Date(value).toLocaleString()
}

function normalizeTicketStatus(status: string): string {
  const normalized = status.trim().toLowerCase()
  if (normalized === "resolved" || normalized === "solved") {
    return "Solved"
  }
  if (normalized === "in progress" || normalized === "in process" || normalized === "escalated") {
    return "In Progress"
  }
  if (normalized === "pending review" || normalized === "awaiting review") {
    return "Solved"
  }
  if (normalized === "open" || normalized === "pending vendor" || normalized === "pending") {
    return "Pending"
  }
  return status
}

function extractEscalationReason(commentText: string): string {
  const separatorIndex = commentText.indexOf(":")
  if (separatorIndex < 0) {
    return ""
  }
  return commentText.slice(separatorIndex + 1).trim()
}

function formatEscalationPreviewText(commentText: string, escalatedBy?: string | null): string {
  const trimmed = commentText.trim()
  const normalized = trimmed.toLowerCase()
  if (normalized.startsWith("escalated to technician") || normalized.startsWith("escalated to admin fault")) {
    const reason = extractEscalationReason(trimmed)
    if (escalatedBy) {
      return reason ? `Escalated by ${escalatedBy}: ${reason}` : `Escalated by ${escalatedBy}`
    }
    return reason ? `Escalated: ${reason}` : "Escalated"
  }
  return commentText
}

function formatTrackingId(id: number): string {
  return `TK-${String(id).padStart(5, "0")}`
}

function toRow(ticket: Ticket): TicketRow {
  return {
    id: ticket.id,
    trackingId: formatTrackingId(ticket.id),
    reporter: ticket.employee_name ?? `Employee #${ticket.employee_id}`,
    title: ticket.title,
    description: ticket.description || "No fault description provided.",
    branch: ticket.location || "N/A",
    updated: ticket.updated_at || ticket.created_at || "",
    priority: ticket.priority,
    status: normalizeTicketStatus(ticket.status),
    escalationTarget: ticket.latest_escalation_target || "Current queue",
    raw: ticket,
  }
}

function solveActionHint(status: string): string {
  if (status === "Pending") {
    return "Open the ticket first to start work."
  }
  if (status === "In Progress") {
    return "Press Solved after you finish the fix."
  }
  return "Solved was pressed by the technician."
}

export function TechnicianTicketTable() {
  const [assignedTickets, setAssignedTickets] = useState<Ticket[]>([])
  const [activeFilter, setActiveFilter] = useState<TicketViewFilter>("all")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  const [commentPreview, setCommentPreview] = useState<EscalationCommentPreview | null>(null)
  const [solvedTicket, setSolvedTicket] = useState<TicketRow | null>(null)
  const [reassignTicket, setReassignTicket] = useState<TicketRow | null>(null)
  const [reassignOptions, setReassignOptions] = useState<Technician[]>([])
  const [reassignTarget, setReassignTarget] = useState("")
  const [reassignComment, setReassignComment] = useState("")
  const [busyTicketId, setBusyTicketId] = useState<number | null>(null)
  const [busyAction, setBusyAction] = useState<"solve" | "reassign_open" | "reassign_submit" | null>(null)
  const [actionDialog, setActionDialog] = useState<ActionDialogState>({
    open: false,
    status: "info",
    message: "",
  })

  const currentUser = getStoredUserSession()
  const currentUserId = currentUser?.id ?? null

  const showActionResult = (status: ActionDialogState["status"], message: string) => {
    setActionDialog({
      open: true,
      status,
      message,
    })
  }

  const loadAssignedTickets = useCallback(async () => {
    const user = getStoredUserSession()
    if (!user) {
      setLoadError("Session expired. Please login again.")
      return
    }

    try {
      const ticketData = await getAssignedTickets(user.id)
      setAssignedTickets(ticketData)
      setLoadError("")
    } catch (fetchError) {
      setLoadError(fetchError instanceof Error ? fetchError.message : "Failed to load assigned tickets.")
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      await loadAssignedTickets()
      setLoading(false)
    }
    void run()
  }, [loadAssignedTickets])

  useAutoRefresh(loadAssignedTickets, {
    enabled: !loading,
    intervalMs: 12000,
  })

  const filteredTickets = useMemo(() => {
    if (activeFilter === "all") {
      return assignedTickets
    }
    if (activeFilter === "pending") {
      return assignedTickets.filter((ticket) => normalizeTicketStatus(ticket.status) === "Pending")
    }
    if (activeFilter === "in_progress") {
      return assignedTickets.filter((ticket) => normalizeTicketStatus(ticket.status) === "In Progress")
    }
    return assignedTickets.filter((ticket) => normalizeTicketStatus(ticket.status) === "Solved")
  }, [activeFilter, assignedTickets])

  const rows = useMemo(() => {
    return filteredTickets.map(toRow)
  }, [filteredTickets])

  const activeFilterLabel = filterOptions.find((option) => option.key === activeFilter)?.label ?? "All"

  const summary = useMemo(
    () => ({
      pending: assignedTickets.filter((ticket) => normalizeTicketStatus(ticket.status) === "Pending").length,
      inProgress: assignedTickets.filter((ticket) => normalizeTicketStatus(ticket.status) === "In Progress").length,
      pendingReview: assignedTickets.filter((ticket) => normalizeTicketStatus(ticket.status) === "Pending Review").length,
      solved: assignedTickets.filter((ticket) => normalizeTicketStatus(ticket.status) === "Solved").length,
    }),
    [assignedTickets]
  )
  const pendingActionTickets = useMemo(
    () => assignedTickets.filter((ticket) => normalizeTicketStatus(ticket.status) === "Pending").slice(0, 4),
    [assignedTickets]
  )

  const handleConfirmSolved = async () => {
    if (!solvedTicket || !currentUserId) {
      showActionResult("error", "Session expired. Please login again.")
      return
    }

    try {
      setBusyTicketId(solvedTicket.id)
      setBusyAction("solve")
      await updateTicketStatus(solvedTicket.id, "Solved", undefined, currentUserId)
      await loadAssignedTickets()
      setSolvedTicket(null)
      showActionResult("success", `Ticket #${solvedTicket.id} marked solved and sent for reporter review.`)
    } catch (error) {
      showActionResult("error", error instanceof Error ? error.message : "Failed to mark ticket as solved.")
    } finally {
      setBusyTicketId(null)
      setBusyAction(null)
    }
  }

  const openReassignDialog = async (ticket: TicketRow) => {
    if (!currentUserId) {
      showActionResult("error", "Session expired. Please login again.")
      return
    }

    try {
      setBusyTicketId(ticket.id)
      setBusyAction("reassign_open")
      const technicianData = await getTechnicians()
      setReassignOptions(technicianData.filter((item) => item.user_id !== currentUserId && item.is_available))
      setReassignTarget("")
      setReassignComment("")
      setReassignTicket(ticket)
    } catch (error) {
      showActionResult("error", error instanceof Error ? error.message : "Failed to load technicians for reassignment.")
    } finally {
      setBusyTicketId(null)
      setBusyAction(null)
    }
  }

  const handleReassignSubmit = async () => {
    if (!reassignTicket || !currentUserId) {
      showActionResult("error", "Session expired. Please login again.")
      return
    }
    if (!reassignTarget) {
      showActionResult("error", "Choose the technician to reassign this ticket to.")
      return
    }
    if (!reassignComment.trim()) {
      showActionResult("error", "Add reassignment notes before continuing.")
      return
    }

    try {
      setBusyTicketId(reassignTicket.id)
      setBusyAction("reassign_submit")
      await escalateTicket(reassignTicket.id, currentUserId, Number(reassignTarget), reassignComment.trim())
      await loadAssignedTickets()
      setReassignTicket(null)
      setReassignTarget("")
      setReassignComment("")
      showActionResult("success", `Ticket #${reassignTicket.id} reassigned successfully.`)
    } catch (error) {
      showActionResult("error", error instanceof Error ? error.message : "Failed to reassign ticket.")
    } finally {
      setBusyTicketId(null)
      setBusyAction(null)
    }
  }

  return (
    <Card className="rounded-xl border border-[#9CB8D3] bg-[#EDF3F9] py-0 shadow-sm">
      <CardHeader className="gap-3 border-b border-[#B7CBE0] bg-[#E1EBF5] px-4 py-4 md:grid-cols-[1fr_auto]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded border border-[#C89A4D] bg-[#FFF2DE] px-2 py-1 text-xs font-semibold text-[#8B5A12]">
            Pending {summary.pending}
          </span>
          <span className="inline-flex items-center rounded border border-[#2D5A84] bg-[#163A5A] px-2 py-1 text-xs font-semibold text-white">
            In Progress {summary.inProgress}
          </span>
          <span className="inline-flex items-center rounded border border-[#D9C38D] bg-[#FFF7E5] px-2 py-1 text-xs font-semibold text-[#8B5A12]">
            Pending Review {summary.pendingReview}
          </span>
          <span className="inline-flex items-center rounded border border-[#7997B5] bg-[#F1F6FB] px-2 py-1 text-xs font-semibold text-[#234A71]">
            Solved {summary.solved}
          </span>
        </div>
        <div className="rounded-lg border border-[#BFD1E4] bg-white px-3 py-2 text-sm text-[#234A71]">
          <p className="font-semibold">Needs Your Action</p>
          {pendingActionTickets.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {pendingActionTickets.map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between gap-3 rounded-md border border-[#D8E4F0] bg-[#F8FBFF] px-2 py-1.5">
                  <p className="truncate text-xs text-[#345F85]">{formatTrackingId(ticket.id)} - {ticket.title}</p>
                  <Button size="sm" className="h-7 bg-[#0A63B8] text-xs text-white hover:bg-[#084C8C]" asChild>
                    <Link href={`/technician/tickets/${ticket.id}`}>Start Work</Link>
                  </Button>
                </div>
              ))}
              {summary.pending > pendingActionTickets.length ? (
                <p className="text-xs text-[#5A7CA0]">+{summary.pending - pendingActionTickets.length} more pending ticket(s)</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-1">No pending tickets waiting for acceptance.</p>
          )}
        </div>

        <div className="flex justify-start md:justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="border-[#93AECA] bg-white text-[#20466D]">
                <Filter className="h-4 w-4" />
                Filter: {activeFilterLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 border-[#93AECA] bg-white">
              {filterOptions.map((option) => (
                <DropdownMenuItem
                  key={option.key}
                  className={cn(
                    "text-[#20466D]",
                    activeFilter === option.key && "bg-[#E8F1FB] font-semibold text-[#173F66]"
                  )}
                  onClick={() => setActiveFilter(option.key)}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="overflow-x-auto p-0 [&_th]:whitespace-nowrap [&_td]:align-top">
        <Table className="min-w-[1250px] table-fixed">
          <TableHeader>
            <TableRow className="border-y-0 bg-[#2E6EA0] hover:bg-[#2E6EA0]">
              <TableHead className="w-[132px] px-4 py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Tracking ID</TableHead>
              <TableHead className="w-[120px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Updated</TableHead>
              <TableHead className="w-[180px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Reporter</TableHead>
              <TableHead className="w-[318px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Subject</TableHead>
              <TableHead className="w-[130px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Status</TableHead>
              <TableHead className="w-[120px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Priority</TableHead>
              <TableHead className="w-[170px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Escalation</TableHead>
              <TableHead className="w-[180px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-slate-500">
                  Loading assigned tickets...
                </TableCell>
              </TableRow>
            ) : loadError ? (
              <TableRow>
                <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-rose-600">
                  {loadError}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-slate-500">
                  No tickets found for this filter.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((ticket) => (
                <TableRow key={ticket.id} className="border-b border-[#C5D5E6] bg-[#F7FAFE]">
                  <TableCell className="px-4 py-3 text-xs font-semibold text-[#2A5D8D] underline underline-offset-2">{ticket.trackingId}</TableCell>
                  <TableCell className="py-3 text-xs text-[#234A71]">{formatDateLabel(ticket.updated)}</TableCell>
                  <TableCell className="py-3 text-xs font-medium text-[#1F4469]">{ticket.reporter}</TableCell>
                  <TableCell className="py-3 text-xs text-[#2A5D8D]">
                    <div className="max-w-[290px] space-y-1">
                      <Link href={`/technician/tickets/${ticket.id}`} className="block truncate font-semibold underline underline-offset-2">
                        {ticket.title}
                      </Link>
                      <p className="line-clamp-2 text-[#4A6887]">{ticket.description}</p>
                    </div>
                  </TableCell>
                  <TableCell className={cn("py-3 text-xs font-semibold", statusBadgeStyles[ticket.status] ?? "text-[#345F85]")}>
                    {ticket.status}
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge
                      className={cn(
                        "rounded-sm border px-2 py-0.5 text-[11px] font-semibold",
                        priorityBadgeStyles[ticket.priority] ?? "border-[#9CC4EA] bg-[#DDEEFF] text-[#2E6092]"
                      )}
                    >
                      {ticket.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 text-xs text-[#1F4469]">
                    {ticket.raw.latest_escalation_comment ? (
                      <div className="space-y-2">
                        <p>{ticket.escalationTarget}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-[#93AECA] bg-white text-[#20466D]"
                          onClick={() =>
                            setCommentPreview({
                              ticketId: ticket.id,
                              title: ticket.title,
                              comment: formatEscalationPreviewText(
                                ticket.raw.latest_escalation_comment ?? "",
                                ticket.raw.latest_escalation_by
                              ),
                              by: ticket.raw.latest_escalation_by,
                              at: ticket.raw.latest_escalation_at,
                            })
                          }
                        >
                          View Comment
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[#4A6887]">No escalation comment</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex flex-col gap-1.5">
                      <Button size="sm" variant="outline" className="h-8 border-[#93AECA] bg-white text-[#20466D]" asChild>
                        <Link href={`/technician/tickets/${ticket.id}`}>
                          {ticket.status === "Pending" ? "Open & Start" : "Open"}
                        </Link>
                      </Button>
                        <Button
                          size="sm"
                          type="button"
                          className="h-8 w-full bg-[#1C7C54] text-white hover:bg-[#155E40] disabled:border disabled:border-[#B9D5C6] disabled:bg-[#EAF4EE] disabled:text-[#6D8E7A] disabled:hover:border-[#B9D5C6] disabled:hover:bg-[#EAF4EE] disabled:hover:text-[#6D8E7A]"
                          disabled={busyTicketId === ticket.id || ticket.status !== "In Progress"}
                          onClick={() => setSolvedTicket(ticket)}
                        >
                          {busyTicketId === ticket.id && busyAction === "solve" ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : null}
                          Solved
                        </Button>
                        <p className="text-[11px] text-[#5B7A9B]">{solveActionHint(ticket.status)}</p>
                        <Button
                          size="sm"
                          type="button"
                          variant="outline"
                          className="h-8 w-full border-[#C89A4D] bg-white text-[#8B5A12] disabled:border-[#E4D0A6] disabled:bg-[#F7F0DF] disabled:text-[#A48A56] disabled:hover:border-[#E4D0A6] disabled:hover:bg-[#F7F0DF] disabled:hover:text-[#A48A56]"
                          disabled={busyTicketId === ticket.id || ticket.status === "Pending Review" || ticket.status === "Solved"}
                          onClick={() => void openReassignDialog(ticket)}
                        >
                          {busyTicketId === ticket.id && busyAction === "reassign_open" ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : null}
                          Reassign
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={Boolean(commentPreview)} onOpenChange={(open) => (!open ? setCommentPreview(null) : undefined)}>
        <DialogContent className="border-[#9CB8D3] bg-[#F7FBFF]">
          <DialogHeader>
            <DialogTitle className="text-[#1D3F63]">
              {commentPreview ? `Escalation Comment - Ticket #${commentPreview.ticketId}` : "Escalation Comment"}
            </DialogTitle>
            <DialogDescription className="text-[#4A6887]">{commentPreview ? commentPreview.title : ""}</DialogDescription>
          </DialogHeader>
          {commentPreview ? (
            <div className="space-y-2 rounded-lg border border-[#C8DAEC] bg-white p-3">
              <p className="text-sm text-slate-800">{commentPreview.comment}</p>
              <p className="text-xs text-slate-500">{formatDateTime(commentPreview.at)}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="border-[#93AECA] bg-white text-[#20466D]" onClick={() => setCommentPreview(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(solvedTicket)} onOpenChange={(open) => (!open ? setSolvedTicket(null) : undefined)}>
        <DialogContent className="border-[#9CB8D3] bg-[#F7FBFF]">
          <DialogHeader>
            <DialogTitle className="text-[#1D3F63]">
              {solvedTicket ? `Confirm Solved - Ticket #${solvedTicket.id}` : "Confirm Solved"}
            </DialogTitle>
            <DialogDescription className="text-[#4A6887]">
              Confirm once you have completed the fix. The ticket will move to reporter review so the user can confirm the issue is solved.
            </DialogDescription>
          </DialogHeader>
          {solvedTicket ? (
            <div className="rounded-lg border border-[#C8DAEC] bg-white p-3 text-sm text-slate-800">
              <p className="font-semibold text-[#1D3F63]">{solvedTicket.title}</p>
              <p className="mt-1 text-[#4A6887]">{solvedTicket.reporter}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-[#93AECA] bg-white text-[#20466D]"
              onClick={() => setSolvedTicket(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#1C7C54] text-white hover:bg-[#155E40]"
              onClick={() => void handleConfirmSolved()}
              disabled={!solvedTicket || busyAction === "solve"}
            >
              {busyAction === "solve" ? "Saving..." : "Solved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reassignTicket)} onOpenChange={(open) => (!open ? setReassignTicket(null) : undefined)}>
        <DialogContent className="border-[#9CB8D3] bg-[#F7FBFF]">
          <DialogHeader>
            <DialogTitle className="text-[#1D3F63]">
              {reassignTicket ? `Reassign Ticket #${reassignTicket.id}` : "Reassign Ticket"}
            </DialogTitle>
            <DialogDescription className="text-[#4A6887]">
              Choose another available technician and explain why the ticket should be handed over.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Technician</label>
              <select
                className="h-10 w-full rounded-md border border-[#B7CBE0] bg-white px-3 text-sm text-slate-800"
                value={reassignTarget}
                onChange={(event) => setReassignTarget(event.target.value)}
                disabled={busyAction === "reassign_submit"}
              >
                <option value="">Select technician</option>
                {reassignOptions.map((technician) => (
                  <option key={technician.id} value={String(technician.id)}>
                    {technician.name} ({technician.skillset})
                  </option>
                ))}
              </select>
              {reassignOptions.length === 0 ? (
                <p className="text-xs text-[#8A6A21]">No alternate technicians are currently available.</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Reassignment Notes</label>
              <textarea
                className="min-h-24 w-full rounded-md border border-[#B7CBE0] bg-white px-3 py-2 text-sm text-slate-800"
                placeholder="Summarize the work done and why another technician should take over."
                value={reassignComment}
                onChange={(event) => setReassignComment(event.target.value)}
                disabled={busyAction === "reassign_submit"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-[#93AECA] bg-white text-[#20466D]"
              onClick={() => {
                setReassignTicket(null)
                setReassignTarget("")
                setReassignComment("")
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#9A6400] text-white hover:bg-[#7F5200]"
              onClick={() => void handleReassignSubmit()}
              disabled={!reassignTicket || busyAction === "reassign_submit" || reassignOptions.length === 0}
            >
              {busyAction === "reassign_submit" ? "Reassigning..." : "Confirm Reassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActionFeedbackDialog
        open={actionDialog.open}
        status={actionDialog.status}
        message={actionDialog.message}
        onOk={() => setActionDialog((current) => ({ ...current, open: false }))}
      />
    </Card>
  )
}
