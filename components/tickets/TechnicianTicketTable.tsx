"use client"

import Link from "next/link"
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, Filter, LoaderCircle, MoreHorizontal } from "lucide-react"

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
  label: "Start Work" | "Continue Work" | "Review" | "View Ticket"
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
  canControlWorkflow: boolean
}

const workflowRowStyles: Record<WorkflowState, string> = {
  "Awaiting Start": "border-l-[#D0891B]",
  "In Progress": "border-l-[#2F7FC9]",
  "Waiting for Employee": "border-l-[#E39A3A]",
  Solved: "border-l-[#3EA56D]",
  Other: "border-l-[#CBD5E1]",
}

const workflowBadgeStyles: Record<WorkflowState, string> = {
  "Awaiting Start": "border-[#E6C589] bg-[#FFF6E5] text-[#8A5A0D]",
  "In Progress": "border-[#9CC4EA] bg-[#EAF4FF] text-[#1F4E7A]",
  "Waiting for Employee": "border-[#F2C27F] bg-[#FFF4E6] text-[#8A4B08]",
  Solved: "border-[#98D4B7] bg-[#EAF9F0] text-[#1E7A45]",
  Other: "border-[#CBD5E1] bg-[#F8FAFC] text-[#475569]",
}

const priorityBadgeStyles: Record<string, string> = {
  Low: "border-[#9CC4EA] bg-[#DDEEFF] text-[#2E6092]",
  Medium: "border-[#93D8C1] bg-[#DDF8EF] text-[#177F5A]",
  High: "border-[#F4D88D] bg-[#FFF5D8] text-[#9A6A00]",
  Critical: "border-[#F4B5B5] bg-[#FFE5E5] text-[#A33939]",
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

function isCheckedInTechnician(technician: Technician): boolean {
  if (typeof technician.checked_in === "boolean") {
    return technician.checked_in
  }
  if (!technician.is_available || !technician.last_check_in_at) {
    return false
  }
  if (!technician.last_check_out_at) {
    return true
  }
  return new Date(technician.last_check_in_at).getTime() >= new Date(technician.last_check_out_at).getTime()
}

function getTransferCandidates(technicians: Technician[], currentUserId: number): Technician[] {
  const activeTechnicians = technicians.filter((item) => item.user_id !== currentUserId && item.is_active)
  const checkedInTechnicians = activeTechnicians.filter((item) => item.is_available && isCheckedInTechnician(item))
  return checkedInTechnicians.length > 0 ? checkedInTechnicians : activeTechnicians
}

function compactMetadata(ticket: Ticket): string[] {
  return [
    ticket.location,
    ticket.category,
    ticket.routing_note,
    ticket.latest_escalation_target ? `Target: ${ticket.latest_escalation_target}` : "",
  ].filter((item): item is string => Boolean(item && item.trim()))
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
      label: `Overdue by ${formatHoursForLabel(Math.abs(remainingHours))}`,
      toneClassName: "border-[#E8A9A9] bg-[#FFF1F1] text-[#9F2D2D]",
      isUrgent: true,
      remainingHours,
    }
  }

  if (remainingHours <= 2) {
    return {
      label: `${formatHoursForLabel(remainingHours)} remaining`,
      toneClassName: "border-[#F0C38A] bg-[#FFF5E8] text-[#8A5408]",
      isUrgent: true,
      remainingHours,
    }
  }

  return {
    label: `${formatHoursForLabel(remainingHours)} remaining`,
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
      label: "Review",
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
      label: "Continue Work",
      hint: "At-risk workflow. Hand over if specialist support is needed.",
      toneClassName: "border-[#F0C38A] bg-[#FFF5E8] text-[#8A5408]",
    }
  }

  return {
    label: workflowState === "In Progress" ? "Continue Work" : "View Ticket",
    hint: "Continue diagnostics, updates, and final resolution.",
    toneClassName: "border-[#BFD7EC] bg-[#F4F9FF] text-[#24517A]",
  }
}

function toRow(ticket: Ticket, nowTs: number, currentUserId: number | null): TicketRow {
  const workflowState = toWorkflowState(ticket.status)
  const sla = calculateSlaState(ticket, workflowState, nowTs)
  const nextAction = determineNextAction(workflowState, sla, ticket)
  const canControlWorkflow =
    Boolean(currentUserId) &&
    ticket.is_currently_assigned_to_me === true &&
    ticket.technician_user_id === currentUserId

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
    canControlWorkflow,
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
  const [expandedTicketIds, setExpandedTicketIds] = useState<Set<number>>(new Set())
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
    return assignedTickets.map((ticket) => toRow(ticket, nowTs, currentUserId)).sort(compareRows)
  }, [assignedTickets, currentUserId])

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

  const toggleExpandedTicket = (ticketId: number) => {
    setExpandedTicketIds((currentIds) => {
      const nextIds = new Set(currentIds)
      if (nextIds.has(ticketId)) {
        nextIds.delete(ticketId)
      } else {
        nextIds.add(ticketId)
      }
      return nextIds
    })
  }

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
    if (!solvedTicket || !currentUserId || !solvedTicket.canControlWorkflow) {
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
    if (!currentUserId || !ticket.canControlWorkflow) {
      showActionResult("error", "Only the assigned technician can transfer this ticket.")
      return
    }

    try {
      setBusyTicketId(ticket.id)
      setBusyAction("reassign_open")
      const technicianData = await getTechnicians({ reassignForTicketId: ticket.id })
      setReassignOptions(getTransferCandidates(technicianData, currentUserId))
      setReassignTarget("")
      setReassignComment("")
      setReassignTicket(ticket)
    } catch (error) {
      showActionResult("error", error instanceof Error ? error.message : "Failed to load technicians for transfer.")
    } finally {
      setBusyTicketId(null)
      setBusyAction(null)
    }
  }

  const handleReassignSubmit = async () => {
    if (!reassignTicket || !currentUserId || !reassignTicket.canControlWorkflow) {
      showActionResult("error", "Session expired. Please login again.")
      return
    }
    if (!reassignTarget) {
      showActionResult("error", "Choose the technician to receive this ticket.")
      return
    }

    try {
      setBusyTicketId(reassignTicket.id)
      setBusyAction("reassign_submit")
      await escalateTicket(reassignTicket.id, currentUserId, Number(reassignTarget), reassignComment.trim() || "Ownership transferred.")
      await loadAssignedTickets()
      setReassignTicket(null)
      setReassignTarget("")
      setReassignComment("")
      showActionResult("success", `Ticket #${reassignTicket.id} transferred successfully.`)
    } catch (error) {
      showActionResult("error", error instanceof Error ? error.message : "Failed to transfer ticket.")
    } finally {
      setBusyTicketId(null)
      setBusyAction(null)
    }
  }

  const handleStartWork = async (ticket: TicketRow) => {
    if (!currentUserId || !ticket.canControlWorkflow) {
      showActionResult("error", "Only the assigned technician can start work on this ticket.")
      return
    }

    try {
      setBusyTicketId(ticket.id)
      setBusyAction(null)
      await updateTicketStatus(ticket.id, "In Progress", undefined, currentUserId)
      await loadAssignedTickets()
      showActionResult("success", `${ticket.trackingId} moved to In Progress.`)
    } catch (error) {
      showActionResult("error", error instanceof Error ? error.message : "Failed to start work.")
    } finally {
      setBusyTicketId(null)
    }
  }

  return (
    <Card className="rounded-lg border border-[#B7CBE0] bg-[#F6FAFD] py-0 shadow-sm">
      <CardHeader className="space-y-3 border-b border-[#D5E2EF] bg-white px-4 py-4">
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

      <CardContent className="p-0">
        {summary.awaitingStart > 0 || summary.urgent > 0 ? (
          <div className="border-b border-[#E8D7B2] bg-[#FFFBF2] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#9F5F00]" />
                <p className="min-w-0 text-sm font-semibold text-[#744A08]">
                  {summary.awaitingStart} tickets awaiting start work
                  {summary.urgent > 0 ? `, ${summary.urgent} SLA urgent` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-[#D3A553] bg-white text-[#7A4E08]"
                onClick={() => setActiveFilter(summary.awaitingStart > 0 ? "awaiting_start" : "all")}
              >
                Review
              </Button>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="border-y-0 bg-[#255F8F] hover:bg-[#255F8F]">
                <TableHead className="w-[118px] px-4 py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Ticket ID
                </TableHead>
                <TableHead className="w-[112px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Updated
                </TableHead>
                <TableHead className="min-w-[280px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Subject
                </TableHead>
                <TableHead className="w-[150px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Reporter
                </TableHead>
                <TableHead className="w-[130px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Branch
                </TableHead>
                <TableHead className="w-[150px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Status
                </TableHead>
                <TableHead className="w-[120px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Priority
                </TableHead>
                <TableHead className="w-[160px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Assigned To
                </TableHead>
                <TableHead className="w-[158px] py-3 pr-4 text-right text-[11px] font-semibold tracking-wide text-white uppercase">
                  Quick Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="px-6 py-8 text-center text-sm text-slate-500">
                    Loading assigned tickets...
                  </TableCell>
                </TableRow>
              ) : loadError ? (
                <TableRow>
                  <TableCell colSpan={9} className="px-6 py-8 text-center text-sm text-rose-600">
                    {loadError}
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="px-6 py-8 text-center text-sm text-slate-500">
                    No tickets found for this filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((ticket, index) => {
                  const expanded = expandedTicketIds.has(ticket.id)
                  const metadata = compactMetadata(ticket.raw)
                  const primaryIsStart = ticket.workflowState === "Awaiting Start" && ticket.canControlWorkflow
                  const primaryLabel = primaryIsStart ? "Start Work" : ticket.nextAction.label
                  const assignee = ticket.raw.technician_name || currentUser?.name || "Assigned technician"

                  return (
                    <Fragment key={ticket.id}>
                      <TableRow
                        className={cn(
                          "border-b border-[#D4E1EF] border-l-4 transition-colors hover:bg-[#EAF3FC]",
                          index % 2 === 0 ? "bg-white" : "bg-[#F7FAFD]",
                          workflowRowStyles[ticket.workflowState],
                          ticket.sla.isUrgent && ticket.workflowState !== "Solved" && "bg-[#FFF8F8] hover:bg-[#FFF1F1]"
                        )}
                      >
                        <TableCell className="px-4 py-3 align-middle">
                          <Link
                            href={`/technician/tickets/${ticket.id}`}
                            className="text-xs font-semibold text-[#2A5D8D] underline-offset-2 hover:underline"
                          >
                            {ticket.trackingId}
                          </Link>
                        </TableCell>
                        <TableCell className="py-3 align-middle text-xs text-[#355B7D]">
                          {formatDateLabel(ticket.updated)}
                        </TableCell>
                        <TableCell className="max-w-[24rem] py-3 align-middle">
                          <div className="min-w-0 space-y-1">
                            <Link
                              href={`/technician/tickets/${ticket.id}`}
                              className="block truncate text-sm font-semibold text-[#173A5D] underline-offset-2 hover:underline"
                              title={ticket.title}
                            >
                              {ticket.title}
                            </Link>
                            <p className="truncate text-[11px] text-[#5D7894]" title={ticket.description}>
                              {ticket.description}
                            </p>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-[11px] font-semibold",
                                ticket.sla.isUrgent ? "text-[#9F2D2D]" : "text-[#24517A]"
                              )}
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  ticket.sla.isUrgent ? "bg-[#D94848]" : "bg-[#2F7FC9]"
                                )}
                              />
                              {ticket.sla.label}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[150px] py-3 align-middle text-xs font-medium text-[#1F4469]">
                          <span className="block truncate" title={ticket.reporter}>
                            {ticket.reporter}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[130px] py-3 align-middle text-xs text-[#355B7D]">
                          <span className="block truncate" title={ticket.branch}>
                            {ticket.branch}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 align-middle">
                          <Badge
                            className={cn(
                              "rounded-sm border px-2 py-0.5 text-[11px] font-semibold",
                              workflowBadgeStyles[ticket.workflowState]
                            )}
                          >
                            {ticket.workflowState}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 align-middle">
                          <Badge
                            className={cn(
                              "rounded-sm border px-2 py-0.5 text-[11px] font-semibold",
                              priorityBadgeStyles[ticket.priority] ?? "border-[#9CC4EA] bg-[#DDEEFF] text-[#2E6092]",
                              ticket.priority === "Critical" && "shadow-[0_0_0_1px_rgba(163,57,57,0.12)]"
                            )}
                          >
                            {ticket.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[160px] py-3 align-middle text-xs text-[#1F4469]">
                          <span className="block truncate" title={assignee}>
                            {assignee}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 pr-4 align-middle">
                          <div className="flex items-center justify-end gap-2">
                            {primaryIsStart ? (
                              <Button
                                size="sm"
                                type="button"
                                className="h-8 min-w-[6.75rem] bg-[#0A63B8] px-3 text-xs text-white hover:bg-[#084C8C]"
                                disabled={busyTicketId === ticket.id}
                                onClick={() => void handleStartWork(ticket)}
                              >
                                {busyTicketId === ticket.id ? <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                                {primaryLabel}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 min-w-[6.75rem] border-[#93AECA] bg-white px-3 text-xs text-[#20466D] hover:bg-[#F3F8FD]"
                                asChild
                              >
                                <Link href={`/technician/tickets/${ticket.id}`}>{primaryLabel}</Link>
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 border-[#C4D4E5] bg-white text-[#315A80] hover:bg-[#F3F8FD]"
                                  aria-label={`More actions for ${ticket.trackingId}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="z-[70] w-48 border-[#B8CDE1] bg-white">
                                <DropdownMenuItem asChild>
                                  <Link href={`/technician/tickets/${ticket.id}`}>View Ticket</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toggleExpandedTicket(ticket.id)}>
                                  {expanded ? "Hide Details" : "Expand Details"}
                                </DropdownMenuItem>
                                {ticket.raw.latest_escalation_comment ? (
                                  <DropdownMenuItem
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
                                  </DropdownMenuItem>
                                ) : null}
                                {ticket.canControlWorkflow ? (
                                  <DropdownMenuItem
                                    disabled={ticket.workflowState === "Waiting for Employee" || ticket.workflowState === "Solved"}
                                    onClick={() => void openReassignDialog(ticket)}
                                  >
                                    Transfer Ticket
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow key={`${ticket.id}-details`} className="border-b border-[#D4E1EF] bg-[#F8FBFF]">
                          <TableCell colSpan={9} className="px-4 py-3">
                            <div className="flex flex-wrap gap-2 text-xs text-[#4F6E8D]">
                              {metadata.length > 0 ? (
                                metadata.map((item) => (
                                  <span key={item} className="rounded border border-[#D7E4F0] bg-white px-2 py-1">
                                    {item}
                                  </span>
                                ))
                              ) : (
                                <span>No additional metadata.</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
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
              {reassignTicket ? `Transfer Ticket #${reassignTicket.id}` : "Transfer Ticket"}
            </DialogTitle>
            <DialogDescription className="text-[#4A6887]">
              Choose another technician and add optional handoff context.
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
                <p className="text-xs text-[#8A6A21]">No alternate active technicians are available.</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Transfer Note</label>
              <textarea
                className="min-h-24 w-full rounded-md border border-[#B7CBE0] bg-white px-3 py-2 text-sm text-slate-800"
                placeholder="Optional: summarize context for the new owner."
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
              {busyAction === "reassign_submit" ? "Transferring..." : "Transfer Ticket"}
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
