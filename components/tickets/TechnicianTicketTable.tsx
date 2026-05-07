"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, Filter, LoaderCircle } from "lucide-react"

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

type TicketViewFilter = "all" | "awaiting_start" | "in_progress" | "waiting_employee" | "solved"
type WorkflowState = "Awaiting Start" | "In Progress" | "Waiting for Employee" | "Solved" | "Other"

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

type SlaState = {
  label: string
  toneClassName: string
  isUrgent: boolean
  remainingHours: number
}

type NextActionState = {
  label: "Start Work" | "Waiting for Employee" | "View Ticket" | "Reassign"
  hint: string
  toneClassName: string
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
  workflowState: WorkflowState
  escalationTarget: string
  raw: Ticket
  sla: SlaState
  nextAction: NextActionState
}

const priorityBadgeStyles: Record<string, string> = {
  Low: "border-[#9CC4EA] bg-[#DDEEFF] text-[#2E6092]",
  Medium: "border-[#93D8C1] bg-[#DDF8EF] text-[#177F5A]",
  High: "border-[#F4D88D] bg-[#FFF5D8] text-[#9A6A00]",
  Critical: "border-[#F4B5B5] bg-[#FFE5E5] text-[#A33939]",
}

const workflowBadgeStyles: Record<WorkflowState, string> = {
  "Awaiting Start": "border-[#E6C589] bg-[#FFF6E5] text-[#8A5A0D]",
  "In Progress": "border-[#9CC4EA] bg-[#EAF4FF] text-[#1F4E7A]",
  "Waiting for Employee": "border-[#F2C27F] bg-[#FFF4E6] text-[#8A4B08]",
  Solved: "border-[#98D4B7] bg-[#EAF9F0] text-[#1E7A45]",
  Other: "border-[#CBD5E1] bg-[#F8FAFC] text-[#334155]",
}

const workflowRowStyles: Record<WorkflowState, string> = {
  "Awaiting Start": "border-l-4 border-l-[#D0891B] bg-[#FFFDF8]",
  "In Progress": "border-l-4 border-l-[#2F7FC9] bg-[#FAFDFF]",
  "Waiting for Employee": "border-l-4 border-l-[#E39A3A] bg-[#FFFCF7]",
  Solved: "border-l-4 border-l-[#3EA56D] bg-[#FBFFFC]",
  Other: "border-l-4 border-l-[#CBD5E1] bg-[#FCFDFE]",
}

const filterOptions: { key: TicketViewFilter; label: string }[] = [
  { key: "all", label: "All Tickets" },
  { key: "awaiting_start", label: "Awaiting Start" },
  { key: "in_progress", label: "In Progress" },
  { key: "waiting_employee", label: "Waiting for Employee" },
  { key: "solved", label: "Solved" },
]

const slaTargetHoursByPriority: Record<string, number> = {
  Critical: 4,
  High: 8,
  Medium: 24,
  Low: 48,
}

function parseDateMs(value?: string | null): number | null {
  if (!value) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.getTime()
}

function formatHoursForLabel(hours: number): string {
  const positiveHours = Math.max(0, Math.ceil(hours))
  if (positiveHours >= 24) {
    const days = Math.ceil(positiveHours / 24)
    return `${days}d`
  }
  return `${positiveHours}h`
}

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
    return "Pending Review"
  }
  if (normalized === "open" || normalized === "pending vendor" || normalized === "pending") {
    return "Pending"
  }
  return status
}

function toWorkflowState(status: string): WorkflowState {
  const normalizedStatus = normalizeTicketStatus(status)
  if (normalizedStatus === "Pending") {
    return "Awaiting Start"
  }
  if (normalizedStatus === "In Progress") {
    return "In Progress"
  }
  if (normalizedStatus === "Pending Review") {
    return "Waiting for Employee"
  }
  if (normalizedStatus === "Solved") {
    return "Solved"
  }
  return "Other"
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

function calculateSlaState(ticket: Ticket, workflowState: WorkflowState, nowTs: number): SlaState {
  if (workflowState === "Solved") {
    return {
      label: "Completed",
      toneClassName: "border-[#BDE3CC] bg-[#F1FCF5] text-[#1E7A45]",
      isUrgent: false,
      remainingHours: Number.POSITIVE_INFINITY,
    }
  }

  const referenceMs =
    parseDateMs(ticket.last_activity_at) ??
    parseDateMs(ticket.accepted_at) ??
    parseDateMs(ticket.assigned_at) ??
    parseDateMs(ticket.created_at) ??
    parseDateMs(ticket.updated_at)

  const elapsedHours = referenceMs ? Math.max(0, (nowTs - referenceMs) / (1000 * 60 * 60)) : 0
  const targetHours = slaTargetHoursByPriority[ticket.priority] ?? 24
  const remainingHours = targetHours - elapsedHours

  if (remainingHours <= 0) {
    return {
      label: `Overdue ${formatHoursForLabel(Math.abs(remainingHours))}`,
      toneClassName: "border-[#E8A9A9] bg-[#FFF1F1] text-[#9F2D2D]",
      isUrgent: true,
      remainingHours,
    }
  }

  if (remainingHours <= 2) {
    return {
      label: `${formatHoursForLabel(remainingHours)} left`,
      toneClassName: "border-[#F0C38A] bg-[#FFF5E8] text-[#8A5408]",
      isUrgent: true,
      remainingHours,
    }
  }

  return {
    label: `${formatHoursForLabel(remainingHours)} left`,
    toneClassName: "border-[#BFD7EC] bg-[#F4F9FF] text-[#24517A]",
    isUrgent: false,
    remainingHours,
  }
}

function determineNextAction(workflowState: WorkflowState, sla: SlaState, ticket: Ticket): NextActionState {
  if (workflowState === "Awaiting Start") {
    return {
      label: "Start Work",
      hint: "Open the ticket and begin troubleshooting.",
      toneClassName: "border-[#E3B36C] bg-[#FFF3DF] text-[#8A570A]",
    }
  }

  if (workflowState === "Waiting for Employee") {
    return {
      label: "Waiting for Employee",
      hint: "Blocked until reporter confirms or reopens.",
      toneClassName: "border-[#F0C38A] bg-[#FFF5E8] text-[#8A5408]",
    }
  }

  if (workflowState === "Solved") {
    return {
      label: "View Ticket",
      hint: "Completed. Keep notes available for audit.",
      toneClassName: "border-[#BDE3CC] bg-[#F1FCF5] text-[#1E7A45]",
    }
  }

  if (workflowState === "In Progress" && (sla.isUrgent || (ticket.escalation_level ?? 0) > 0)) {
    return {
      label: "Reassign",
      hint: "At-risk workflow. Hand over if specialist support is needed.",
      toneClassName: "border-[#F0C38A] bg-[#FFF5E8] text-[#8A5408]",
    }
  }

  return {
    label: "View Ticket",
    hint: "Continue diagnostics, updates, and final resolution.",
    toneClassName: "border-[#BFD7EC] bg-[#F4F9FF] text-[#24517A]",
  }
}

function toRow(ticket: Ticket, nowTs: number): TicketRow {
  const workflowState = toWorkflowState(ticket.status)
  const sla = calculateSlaState(ticket, workflowState, nowTs)
  const nextAction = determineNextAction(workflowState, sla, ticket)

  return {
    id: ticket.id,
    trackingId: formatTrackingId(ticket.id),
    reporter: ticket.employee_name ?? `Employee #${ticket.employee_id}`,
    title: ticket.title,
    description: ticket.description || "No fault description provided.",
    branch: ticket.location || "N/A",
    updated: ticket.last_activity_at || ticket.updated_at || ticket.created_at || "",
    priority: ticket.priority,
    workflowState,
    escalationTarget: ticket.latest_escalation_target || "Current queue",
    raw: ticket,
    sla,
    nextAction,
  }
}

function getWorkflowSortRank(workflowState: WorkflowState): number {
  if (workflowState === "Awaiting Start") {
    return 0
  }
  if (workflowState === "In Progress") {
    return 1
  }
  if (workflowState === "Waiting for Employee") {
    return 2
  }
  if (workflowState === "Solved") {
    return 3
  }
  return 4
}

function compareRows(left: TicketRow, right: TicketRow): number {
  const leftUrgentRank = left.sla.isUrgent ? 0 : 1
  const rightUrgentRank = right.sla.isUrgent ? 0 : 1
  if (leftUrgentRank !== rightUrgentRank) {
    return leftUrgentRank - rightUrgentRank
  }

  const leftWorkflowRank = getWorkflowSortRank(left.workflowState)
  const rightWorkflowRank = getWorkflowSortRank(right.workflowState)
  if (leftWorkflowRank !== rightWorkflowRank) {
    return leftWorkflowRank - rightWorkflowRank
  }

  const leftSla = Number.isFinite(left.sla.remainingHours) ? left.sla.remainingHours : Number.POSITIVE_INFINITY
  const rightSla = Number.isFinite(right.sla.remainingHours) ? right.sla.remainingHours : Number.POSITIVE_INFINITY
  if (leftSla !== rightSla) {
    return leftSla - rightSla
  }

  return right.id - left.id
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

  const allRows = useMemo(() => {
    const nowTs = Date.now()
    return assignedTickets.map((ticket) => toRow(ticket, nowTs)).sort(compareRows)
  }, [assignedTickets])

  const filteredRows = useMemo(() => {
    if (activeFilter === "all") {
      return allRows
    }
    if (activeFilter === "awaiting_start") {
      return allRows.filter((row) => row.workflowState === "Awaiting Start")
    }
    if (activeFilter === "in_progress") {
      return allRows.filter((row) => row.workflowState === "In Progress")
    }
    if (activeFilter === "waiting_employee") {
      return allRows.filter((row) => row.workflowState === "Waiting for Employee")
    }
    return allRows.filter((row) => row.workflowState === "Solved")
  }, [activeFilter, allRows])

  const activeFilterLabel = filterOptions.find((option) => option.key === activeFilter)?.label ?? "All Tickets"

  const summary = useMemo(
    () => ({
      awaitingStart: allRows.filter((row) => row.workflowState === "Awaiting Start").length,
      inProgress: allRows.filter((row) => row.workflowState === "In Progress").length,
      waitingEmployee: allRows.filter((row) => row.workflowState === "Waiting for Employee").length,
      solved: allRows.filter((row) => row.workflowState === "Solved").length,
      urgent: allRows.filter((row) => row.sla.isUrgent && row.workflowState !== "Solved").length,
    }),
    [allRows]
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
      <CardHeader className="space-y-3 border-b border-[#B7CBE0] bg-[#E1EBF5] px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded border border-[#E6C589] bg-[#FFF6E5] px-2 py-1 text-xs font-semibold text-[#8A5A0D]">
            Awaiting Start {summary.awaitingStart}
          </span>
          <span className="inline-flex items-center rounded border border-[#9CC4EA] bg-[#EAF4FF] px-2 py-1 text-xs font-semibold text-[#1F4E7A]">
            In Progress {summary.inProgress}
          </span>
          <span className="inline-flex items-center rounded border border-[#F2C27F] bg-[#FFF4E6] px-2 py-1 text-xs font-semibold text-[#8A4B08]">
            Waiting for Employee {summary.waitingEmployee}
          </span>
          <span className="inline-flex items-center rounded border border-[#98D4B7] bg-[#EAF9F0] px-2 py-1 text-xs font-semibold text-[#1E7A45]">
            Solved {summary.solved}
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-[#E3A5A5] bg-[#FFF1F1] px-2 py-1 text-xs font-semibold text-[#9F2D2D]">
            <AlertTriangle className="h-3.5 w-3.5" />
            Urgent {summary.urgent}
          </span>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-[#3F6288]">
            One unified operational queue shows what needs action, what is blocked, and what is completed.
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="border-[#93AECA] bg-white text-[#20466D]">
                <Filter className="h-4 w-4" />
                Filter: {activeFilterLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 border-[#93AECA] bg-white">
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
        <Table className="min-w-[1080px] table-fixed">
          <TableHeader>
            <TableRow className="border-y-0 bg-[#2E6EA0] hover:bg-[#2E6EA0]">
              <TableHead className="w-[360px] px-4 py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Ticket</TableHead>
              <TableHead className="w-[220px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Workflow State</TableHead>
              <TableHead className="w-[160px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Priority</TableHead>
              <TableHead className="w-[170px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">SLA / Urgency</TableHead>
              <TableHead className="w-[220px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Next Action</TableHead>
              <TableHead className="w-[190px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500">
                  Loading assigned tickets...
                </TableCell>
              </TableRow>
            ) : loadError ? (
              <TableRow>
                <TableCell colSpan={6} className="px-6 py-6 text-center text-sm text-rose-600">
                  {loadError}
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500">
                  No tickets found for this filter.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((ticket) => (
                <TableRow
                  key={ticket.id}
                  className={cn(
                    "border-b border-[#C5D5E6]",
                    workflowRowStyles[ticket.workflowState],
                    ticket.sla.isUrgent && ticket.workflowState !== "Solved" && "ring-1 ring-inset ring-[#F2C6C6]"
                  )}
                >
                  <TableCell className="px-4 py-3 text-xs text-[#2A5D8D]">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex rounded border border-[#B8CDE1] bg-white px-1.5 py-0.5 font-semibold text-[#2A5D8D]">
                          {ticket.trackingId}
                        </span>
                        <span className="text-[#4A6887]">Updated {formatDateLabel(ticket.updated)}</span>
                      </div>
                      <Link href={`/technician/tickets/${ticket.id}`} className="block truncate text-sm font-semibold underline underline-offset-2">
                        {ticket.title}
                      </Link>
                      <p className="line-clamp-2 text-[#4A6887]">{ticket.description}</p>
                      <p className="text-[11px] text-[#5A7CA0]">
                        Reporter: <span className="font-medium text-[#1F4469]">{ticket.reporter}</span> | Branch:{" "}
                        <span className="font-medium text-[#1F4469]">{ticket.branch}</span>
                      </p>
                    </div>
                  </TableCell>

                  <TableCell className="py-3 text-xs text-[#1F4469]">
                    <div className="space-y-2">
                      <Badge
                        className={cn(
                          "rounded-sm border px-2 py-0.5 text-[11px] font-semibold",
                          workflowBadgeStyles[ticket.workflowState]
                        )}
                      >
                        {ticket.workflowState}
                      </Badge>
                      <p className="text-[11px] text-[#5A7CA0]">Escalation target: {ticket.escalationTarget}</p>
                      {ticket.raw.latest_escalation_comment ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-[#93AECA] bg-white px-2.5 text-[11px] text-[#20466D]"
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
                          View Escalation
                        </Button>
                      ) : (
                        <p className="text-[11px] text-[#6C87A3]">No escalation comment</p>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="py-3">
                    <Badge
                      className={cn(
                        "rounded-sm border px-2 py-0.5 text-[11px] font-semibold",
                        priorityBadgeStyles[ticket.priority] ?? priorityBadgeStyles.Medium
                      )}
                    >
                      {ticket.priority}
                    </Badge>
                  </TableCell>

                  <TableCell className="py-3">
                    <Badge className={cn("rounded-sm border px-2 py-0.5 text-[11px] font-semibold", ticket.sla.toneClassName)}>
                      {ticket.sla.label}
                    </Badge>
                  </TableCell>

                  <TableCell className="py-3 text-xs text-[#1F4469]">
                    <div className="space-y-1.5">
                      <Badge className={cn("rounded-sm border px-2 py-0.5 text-[11px] font-semibold", ticket.nextAction.toneClassName)}>
                        {ticket.nextAction.label}
                      </Badge>
                      <p className="text-[11px] leading-4 text-[#5A7CA0]">{ticket.nextAction.hint}</p>
                    </div>
                  </TableCell>

                  <TableCell className="py-2">
                    <div className="flex flex-col gap-1.5">
                      <Button
                        size="sm"
                        variant={ticket.workflowState === "Awaiting Start" ? "default" : "outline"}
                        className={
                          ticket.workflowState === "Awaiting Start"
                            ? "h-8 bg-[#0A63B8] text-white hover:bg-[#084C8C]"
                            : "h-8 border-[#93AECA] bg-white text-[#20466D]"
                        }
                        asChild
                      >
                        <Link href={`/technician/tickets/${ticket.id}`}>
                          {ticket.workflowState === "Awaiting Start" ? "Start Work" : "View Ticket"}
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        className="h-8 w-full bg-[#1C7C54] text-white hover:bg-[#155E40] disabled:border disabled:border-[#B9D5C6] disabled:bg-[#EAF4EE] disabled:text-[#6D8E7A]"
                        disabled={busyTicketId === ticket.id || ticket.workflowState !== "In Progress"}
                        onClick={() => setSolvedTicket(ticket)}
                      >
                        {busyTicketId === ticket.id && busyAction === "solve" ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : null}
                        Solved
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        className="h-8 w-full border-[#C89A4D] bg-white text-[#8B5A12] disabled:border-[#E4D0A6] disabled:bg-[#F7F0DF] disabled:text-[#A48A56]"
                        disabled={busyTicketId === ticket.id || ticket.workflowState === "Waiting for Employee" || ticket.workflowState === "Solved"}
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
