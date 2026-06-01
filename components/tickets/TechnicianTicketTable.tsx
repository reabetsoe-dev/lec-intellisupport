"use client"

import Link from "next/link"
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Hourglass,
  ListFilter,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
  UserRound,
} from "lucide-react"

import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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

type SummaryMetric = {
  key: TicketViewFilter | "urgent"
  label: string
  caption: string
  value: number
  icon: typeof Hourglass
  className: string
  iconClassName: string
}

const workflowTextStyles: Record<WorkflowState, string> = {
  "Awaiting Start": "text-[#9A5B00]",
  "In Progress": "text-[#1F5E92]",
  "Waiting for Employee": "text-[#9A5B00]",
  Solved: "text-[#1E7A45]",
  Other: "text-[#475569]",
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

function formatTimeLabel(value?: string | null): string {
  if (!value) {
    return "N/A"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "N/A"
  }
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "N/A"
  }
  return new Date(value).toLocaleString()
}

function getTicketChannelLabel(ticket: Ticket): string {
  const description = String(ticket.description || "").toLowerCase()
  if (description.includes("intake channel: whatsapp")) {
    return "WhatsApp"
  }
  if (ticket.source === "qr_asset_troubleshooting" || ticket.source === "qr_asset_manual_report") {
    return "QR Asset"
  }
  return ticket.source === "manual" ? "Manual" : "Ticket"
}

function getWorkflowBadgeClassName(workflowState: WorkflowState): string {
  if (workflowState === "Awaiting Start") {
    return "border-[#F1C979] bg-[#FFF8E8] text-[#9A5B00]"
  }
  if (workflowState === "In Progress") {
    return "border-[#B9D9F7] bg-[#EFF7FF] text-[#1F5E92]"
  }
  if (workflowState === "Waiting for Employee") {
    return "border-[#F4C38B] bg-[#FFF4E8] text-[#9A4E0A]"
  }
  if (workflowState === "Solved") {
    return "border-[#BDE3CC] bg-[#F0FBF5] text-[#1E7A45]"
  }
  return "border-[#CBD5E1] bg-[#F8FAFC] text-[#475569]"
}

function getPriorityIndicatorClassName(priority: string): string {
  if (priority === "Critical" || priority === "High") {
    return "text-[#D71920]"
  }
  if (priority === "Medium") {
    return "text-[#D98912]"
  }
  return "text-[#2F7FC9]"
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

  const summaryMetrics: SummaryMetric[] = [
    {
      key: "awaiting_start",
      label: "Awaiting Start",
      caption: "Needs attention",
      value: summary.awaitingStart,
      icon: Hourglass,
      className: "border-[#F3DFB4] bg-[#FFF8E8]",
      iconClassName: "bg-[#FFE8AC] text-[#B36A00]",
    },
    {
      key: "in_progress",
      label: "In Progress",
      caption: "Currently open",
      value: summary.inProgress,
      icon: RefreshCw,
      className: "border-[#C8DEF5] bg-[#F0F7FF]",
      iconClassName: "bg-[#DCEEFF] text-[#0A63B8]",
    },
    {
      key: "waiting_employee",
      label: "Waiting for Employee",
      caption: "Customer response",
      value: summary.waitingEmployee,
      icon: UserRound,
      className: "border-[#F0D0B6] bg-[#FFF4EC]",
      iconClassName: "bg-[#FFE1CF] text-[#C55F1A]",
    },
    {
      key: "solved",
      label: "Solved",
      caption: "Completed tickets",
      value: summary.solved,
      icon: CheckCircle2,
      className: "border-[#BFE3CE] bg-[#F1FBF5]",
      iconClassName: "bg-[#DFF5E8] text-[#1E7A45]",
    },
    {
      key: "urgent",
      label: "Urgent",
      caption: "High priority issues",
      value: summary.urgent,
      icon: AlertTriangle,
      className: "border-[#F0C6C6] bg-[#FFF1F1]",
      iconClassName: "bg-[#FFE0E0] text-[#D71920]",
    },
  ]

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summaryMetrics.map((metric) => {
          const Icon = metric.icon
          const targetFilter = metric.key === "urgent" ? "all" : metric.key
          return (
            <button
              key={metric.key}
              type="button"
              className={cn(
                "flex min-h-[5.5rem] items-center gap-3 rounded-md border px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                metric.className,
                activeFilter === targetFilter && metric.key !== "urgent" && "ring-2 ring-[#0A63B8]/25"
              )}
              onClick={() => setActiveFilter(targetFilter)}
            >
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", metric.iconClassName)}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-bold leading-6 text-[#0B1F3A]">{metric.value}</span>
                <span className="block text-xs font-semibold text-[#1E3A6D]">{metric.label}</span>
                <span className="block truncate text-[11px] text-[#5D7692]">{metric.caption}</span>
              </span>
            </button>
          )
        })}
      </div>

      <Card className="overflow-hidden rounded-lg border border-[#B7CBE0] bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#D5E2EF] bg-white px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#C9D9EA] bg-[#F8FBFF] text-[#20466D]">
                <ListFilter className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[#102D4A]">Operational Ticket Queue</h2>
                <p className="mt-0.5 text-xs text-[#5D7692]">
                  One unified operational queue shows what needs action, what is blocked, and what is completed.
                </p>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline" className="border-[#C7D7E8] bg-white text-[#20466D]">
                  <ListFilter className="h-4 w-4" />
                  Filters
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
            <table className="min-w-[1040px] w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#071528] text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
                  <th className="w-10 px-4 py-3"></th>
                  <th className="px-4 py-3">Ticket</th>
                  <th className="min-w-[260px] px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Reporter</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">SLA</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1EAF4]">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-8 text-center text-sm text-slate-500">
                      Loading assigned tickets...
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-8 text-center text-sm text-rose-600">
                      {loadError}
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-8 text-center text-sm text-slate-500">
                      No tickets found for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((ticket) => {
                    const expanded = expandedTicketIds.has(ticket.id)
                    const metadata = compactMetadata(ticket.raw)
                    const primaryIsStart = ticket.workflowState === "Awaiting Start" && ticket.canControlWorkflow
                    const primaryLabel = primaryIsStart ? "Start Work" : ticket.nextAction.label

                    return (
                      <Fragment key={ticket.id}>
                        <tr
                          className={cn(
                            "bg-white align-top transition-colors hover:bg-[#F8FBFF]",
                            ticket.sla.isUrgent && ticket.workflowState !== "Solved" && "bg-[#FFF9F9]"
                          )}
                        >
                          <td className="px-4 py-4">
                            <button
                              type="button"
                              className="flex h-6 w-6 items-center justify-center rounded border border-[#C7D7E8] text-[#315A80] hover:bg-[#F0F6FC]"
                              onClick={() => toggleExpandedTicket(ticket.id)}
                              aria-label={expanded ? `Collapse ${ticket.trackingId}` : `Expand ${ticket.trackingId}`}
                            >
                              <span className="text-sm leading-none">{expanded ? "-" : "+"}</span>
                            </button>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              <Link
                                href={`/technician/tickets/${ticket.id}`}
                                className="font-semibold text-[#0A63B8] hover:underline"
                              >
                                {ticket.trackingId}
                              </Link>
                              <div className="flex items-center gap-1 text-[11px] text-[#4A7D5C]">
                                <span className="h-2 w-2 rounded-full bg-[#29A56A]" />
                                {getTicketChannelLabel(ticket.raw)}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              <Link
                                href={`/technician/tickets/${ticket.id}`}
                                className="line-clamp-1 font-semibold text-[#102D4A] hover:underline"
                                title={ticket.title}
                              >
                                {ticket.title}
                              </Link>
                              <span className="inline-flex rounded bg-[#DCEEFF] px-2 py-0.5 text-[11px] font-semibold text-[#0A63B8]">
                                {ticket.raw.category || "ICT"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold",
                                getWorkflowBadgeClassName(ticket.workflowState)
                              )}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              {ticket.workflowState}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", getPriorityIndicatorClassName(ticket.priority))}>
                              <span className="flex h-4 w-4 items-end gap-0.5">
                                <span className="h-1.5 w-1 rounded-sm bg-current" />
                                <span className="h-2.5 w-1 rounded-sm bg-current" />
                                <span className="h-4 w-1 rounded-sm bg-current" />
                              </span>
                              {ticket.priority}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-xs font-medium text-[#36577E]">{ticket.branch}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#5C6BE8] text-xs font-semibold text-white">
                                {ticket.reporter.charAt(0).toUpperCase()}
                              </span>
                              <span className="max-w-[9rem] truncate text-xs font-medium text-[#1F3654]" title={ticket.reporter}>
                                {ticket.reporter}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs text-[#36577E]">
                            <div className="flex items-start gap-1.5">
                              <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7890AA]" />
                              <span>
                                <span className="block">{formatDateLabel(ticket.updated)}</span>
                                <span className="block">{formatTimeLabel(ticket.updated)}</span>
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className={cn("font-semibold", ticket.sla.isUrgent ? "text-[#D71920]" : "text-[#24517A]")}>
                              {ticket.sla.label}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              {primaryIsStart ? (
                                <Button
                                  size="sm"
                                  type="button"
                                  className="h-8 min-w-[6.5rem] bg-[#0A63B8] px-3 text-white hover:bg-[#084C8C]"
                                  disabled={busyTicketId === ticket.id}
                                  onClick={() => void handleStartWork(ticket)}
                                >
                                  {busyTicketId === ticket.id ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                                  {primaryLabel}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 min-w-[6.5rem] border-[#93AECA] bg-white px-3 text-[#20466D] hover:bg-[#F3F8FD]"
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
                                  {ticket.workflowState === "In Progress" && ticket.canControlWorkflow ? (
                                    <DropdownMenuItem onClick={() => setSolvedTicket(ticket)}>
                                      Mark Solved
                                    </DropdownMenuItem>
                                  ) : null}
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
                          </td>
                        </tr>
                        {expanded ? (
                          <tr key={`${ticket.id}-expanded`} className="bg-[#F8FBFF]">
                            <td className="px-4 py-3"></td>
                            <td colSpan={9} className="px-4 py-3">
                              <p className="max-w-5xl text-sm leading-5 text-[#4A6887]">{ticket.description}</p>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#4F6E8D]">
                                {metadata.length > 0 ? metadata.map((item) => (
                                  <span key={item} className="rounded border border-[#D7E4F0] bg-white px-2 py-1">
                                    {item}
                                  </span>
                                )) : <span>No additional metadata.</span>}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
    </>
  )
}
