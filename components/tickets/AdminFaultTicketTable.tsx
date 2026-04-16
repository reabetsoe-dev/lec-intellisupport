"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Building2,
  Check,
  ChevronDown,
  CircleCheck,
  CircleDot,
  Clock3,
  MapPin,
  MessageSquareMore,
  TriangleAlert,
  UserRound,
  Wrench,
  X,
} from "lucide-react"

import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  createTicketComment,
  escalateTicketByAdmin,
  getAllTickets,
  type Ticket,
  updateTicketPriority,
  updateTicketStatus,
} from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"
import { useAutoRefresh } from "@/lib/use-auto-refresh"
import { cn } from "@/lib/utils"

type TicketRecord = {
  id: number
  tracking_id: string
  requester: string
  employee_name: string
  title: string
  description: string
  location: string
  created_at: string
  priority: string
  status: string
  technician: string
  technician_id: number | null
  latest_escalation_comment?: string | null
  latest_escalation_by?: string | null
  latest_escalation_at?: string | null
  latest_escalation_target?: string | null
}

const priorityOptions = ["Low", "Medium", "High", "Critical"]

const priorityBadgeStyles: Record<string, string> = {
  Low: "border-[#9CC4EA] bg-[#DDEEFF] text-[#2E6092]",
  Medium: "border-[#93D8C1] bg-[#DDF8EF] text-[#177F5A]",
  High: "border-[#F4D88D] bg-[#FFF5D8] text-[#9A6A00]",
  Critical: "border-[#F4B5B5] bg-[#FFE5E5] text-[#A33939]",
}

const statusTextStyles: Record<string, string> = {
  Pending: "text-[#D63C3C]",
  "In Progress": "text-[#6D3CC4]",
  "Pending Review": "text-[#B26B00]",
  Solved: "text-[#1E7A45]",
}

function normalizeTicketStatus(status: string): string {
  const normalized = status.trim().toLowerCase()
  if (normalized === "open" || normalized === "pending vendor" || normalized === "pending") return "Pending"
  if (normalized === "escalated") return "In Progress"
  if (normalized === "in progress" || normalized === "in process") return "In Progress"
  if (normalized === "pending review" || normalized === "awaiting review") return "Pending Review"
  if (normalized === "resolved" || normalized === "solved") return "Solved"
  return status
}

function formatTrackingId(id: number): string {
  return `TK-${String(id).padStart(5, "0")}`
}

function formatDateLabel(isoDate: string): string {
  if (!isoDate) return "N/A"
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function formatDateTime(value?: string | null): string {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function toRow(ticket: Ticket): TicketRecord {
  const requesterName = ticket.caller_name?.trim() || ticket.employee_name || `Employee #${ticket.employee_id}`
  return {
    id: ticket.id,
    tracking_id: formatTrackingId(ticket.id),
    requester: requesterName,
    employee_name: ticket.employee_name ?? `Employee #${ticket.employee_id}`,
    title: ticket.title,
    description: ticket.description || "",
    location: ticket.location || "",
    created_at: ticket.created_at || "",
    priority: ticket.priority,
    status: normalizeTicketStatus(ticket.status),
    technician: ticket.technician_name ?? (ticket.technician_id ? `Technician #${ticket.technician_id}` : "Unassigned"),
    technician_id: ticket.technician_id ?? null,
    latest_escalation_comment: ticket.latest_escalation_comment ?? null,
    latest_escalation_by: ticket.latest_escalation_by ?? null,
    latest_escalation_at: ticket.latest_escalation_at ?? null,
    latest_escalation_target: ticket.latest_escalation_target ?? null,
  }
}

export function AdminFaultTicketTable() {
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<TicketRecord[]>([])
  const [priorityFilter, setPriorityFilter] = useState("All")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [resultDialog, setResultDialog] = useState<{
    open: boolean
    status: "success" | "error"
    message: string
  }>({
    open: false,
    status: "success",
    message: "",
  })

  const [viewTicket, setViewTicket] = useState<TicketRecord | null>(null)
  const [acceptingViewTicket, setAcceptingViewTicket] = useState(false)
  const [sendingForReview, setSendingForReview] = useState(false)
  const [priorityTicket, setPriorityTicket] = useState<TicketRecord | null>(null)
  const [nextPriority, setNextPriority] = useState("Medium")
  const [savingPriority, setSavingPriority] = useState(false)
  const [escalationTicket, setEscalationTicket] = useState<TicketRecord | null>(null)
  const [escalationComment, setEscalationComment] = useState("")
  const [escalating, setEscalating] = useState(false)
  const [commentDraft, setCommentDraft] = useState("")
  const [commentSaving, setCommentSaving] = useState(false)
  const [commentError, setCommentError] = useState("")
  const [commentSuccess, setCommentSuccess] = useState("")

  const showActionFeedback = (status: "success" | "error", message: string) => {
    setResultDialog({
      open: true,
      status,
      message,
    })
  }

  const loadTickets = useCallback(async () => {
    try {
      const data = await getAllTickets()
      setRows(data.map(toRow))
      setLoadError("")
    } catch (fetchError) {
      setLoadError(fetchError instanceof Error ? fetchError.message : "Failed to load tickets.")
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      await loadTickets()
      setLoading(false)
    }
    void run()
  }, [loadTickets])

  useAutoRefresh(loadTickets, {
    enabled: !loading,
    intervalMs: 12000,
  })

  useEffect(() => {
    setCommentDraft("")
    setCommentError("")
    setCommentSuccess("")
  }, [viewTicket?.id])

  const filteredRows = rows.filter((ticket) => {
    const search = query.toLowerCase()
    const matchesQuery =
      ticket.tracking_id.toLowerCase().includes(search) ||
      ticket.title.toLowerCase().includes(search) ||
      ticket.requester.toLowerCase().includes(search) ||
      ticket.technician.toLowerCase().includes(search) ||
      String(ticket.id).includes(search)
    const matchesPriority = priorityFilter === "All" || ticket.priority === priorityFilter
    return matchesQuery && matchesPriority
  })

  const summary = {
    open: rows.filter((row) => row.status === "Pending").length,
    pendingReview: rows.filter((row) => row.status === "Pending Review").length,
    assigned: rows.filter((row) => row.technician_id !== null).length,
    unassigned: rows.filter((row) => row.technician_id === null).length,
    highPriority: rows.filter((row) => row.priority === "High" || row.priority === "Critical").length,
  }

  const refreshRow = async (ticketId: number) => {
    const all = await getAllTickets()
    const updated = all.find((item) => item.id === ticketId)
    if (!updated) return
    setRows((current) => current.map((row) => (row.id === ticketId ? toRow(updated) : row)))
  }

  const handleReceive = async (ticketId: number) => {
    const user = getStoredUserSession()
    const acceptedByAdminId = user?.role === "admin_fault" ? user.id : undefined
    await updateTicketStatus(ticketId, "In Progress", acceptedByAdminId)
    await refreshRow(ticketId)
  }

  const handleSendForReview = async (ticketId: number) => {
    const user = getStoredUserSession()
    const acceptedByAdminId = user?.role === "admin_fault" ? user.id : undefined
    await updateTicketStatus(ticketId, "Pending Review", acceptedByAdminId)
    await refreshRow(ticketId)
  }

  const handleAcceptFromDialog = async () => {
    if (!viewTicket) return
    try {
      setAcceptingViewTicket(true)
      await handleReceive(viewTicket.id)
      showActionFeedback("success", `Ticket #${viewTicket.id} accepted and moved to In Progress.`)
      setViewTicket(null)
    } catch (actionError) {
      showActionFeedback("error", actionError instanceof Error ? actionError.message : "Failed to receive ticket.")
    } finally {
      setAcceptingViewTicket(false)
    }
  }

  const handleSendForReviewFromDialog = async () => {
    if (!viewTicket) return
    try {
      setSendingForReview(true)
      await handleSendForReview(viewTicket.id)
      showActionFeedback("success", `Ticket #${viewTicket.id} moved to Pending Review for reporter approval.`)
      setViewTicket(null)
    } catch (actionError) {
      showActionFeedback("error", actionError instanceof Error ? actionError.message : "Failed to send ticket for review.")
    } finally {
      setSendingForReview(false)
    }
  }

  const handlePrioritySubmit = async () => {
    if (!priorityTicket) return
    try {
      setSavingPriority(true)
      await updateTicketPriority(priorityTicket.id, nextPriority)
      await refreshRow(priorityTicket.id)
      showActionFeedback("success", `Ticket #${priorityTicket.id} priority updated to ${nextPriority}.`)
      setPriorityTicket(null)
    } catch (actionError) {
      showActionFeedback("error", actionError instanceof Error ? actionError.message : "Failed to update priority.")
    } finally {
      setSavingPriority(false)
    }
  }

  const submitEscalation = async () => {
    if (!escalationTicket) return
    const user = getStoredUserSession()
    if (!user || user.role !== "admin_fault") {
      showActionFeedback("error", "Admin Fault session required. Please login again.")
      return
    }
    if (!escalationComment.trim()) {
      showActionFeedback("error", "Please provide escalation details.")
      return
    }
    try {
      setEscalating(true)
      const updatedTicket = await escalateTicketByAdmin(escalationTicket.id, user.id, escalationComment.trim())
      await refreshRow(escalationTicket.id)
      showActionFeedback(
        "success",
        updatedTicket.technician_name
          ? `Ticket #${escalationTicket.id} auto-escalated to ${updatedTicket.technician_name}.`
          : `Ticket #${escalationTicket.id} auto-escalated successfully.`
      )
      setEscalationTicket(null)
      setEscalationComment("")
    } catch (actionError) {
      showActionFeedback("error", actionError instanceof Error ? actionError.message : "Failed to escalate ticket.")
    } finally {
      setEscalating(false)
    }
  }

  const handleCommentSubmit = async () => {
    if (!viewTicket) return
    const user = getStoredUserSession()
    if (!user || user.role !== "admin_fault") {
      setCommentError("Admin Fault session required. Please login again.")
      return
    }
    if (!commentDraft.trim()) {
      setCommentError("Comment cannot be empty.")
      return
    }
    try {
      setCommentSaving(true)
      setCommentError("")
      setCommentSuccess("")
      await createTicketComment(viewTicket.id, {
        author_id: user.id,
        comment: commentDraft.trim(),
      })
      setCommentDraft("")
      setCommentSuccess("Comment sent to employee.")
      showActionFeedback("success", "Comment sent to employee.")
    } catch (submitError) {
      const nextMessage = submitError instanceof Error ? submitError.message : "Failed to send comment."
      setCommentError(nextMessage)
      showActionFeedback("error", nextMessage)
    } finally {
      setCommentSaving(false)
    }
  }

  return (
    <Card className="rounded-xl border border-[#9CB8D3] bg-[#EDF3F9] py-0 shadow-sm">
      <CardHeader className="space-y-4 border-b border-[#B7CBE0] bg-[#E1EBF5] px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded border border-[#2D5A84] bg-[#163A5A] px-2 py-1 text-xs font-semibold text-white">Open tickets {summary.open}</span>
          <span className="inline-flex items-center rounded border border-[#C89A4D] bg-[#FFF2DE] px-2 py-1 text-xs font-semibold text-[#8B5A12]">Pending Review {summary.pendingReview}</span>
          <span className="inline-flex items-center rounded border border-[#7997B5] bg-[#F1F6FB] px-2 py-1 text-xs font-semibold text-[#234A71]">Assigned {summary.assigned}</span>
          <span className="inline-flex items-center rounded border border-[#7997B5] bg-[#F1F6FB] px-2 py-1 text-xs font-semibold text-[#234A71]">Unassigned {summary.unassigned}</span>
          <span className="inline-flex items-center rounded border border-[#D9A2A2] bg-[#FFEAEA] px-2 py-1 text-xs font-semibold text-[#A33C3C]">High/Critical {summary.highPriority}</span>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by tracking ID, caller, or technician" className="max-w-lg border-[#93AECA] bg-white" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-[#93AECA] bg-white text-[#20466D]">
                Priority: {priorityFilter}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Priority</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPriorityFilter("All")}>All</DropdownMenuItem>
              {priorityOptions.map((item) => (
                <DropdownMenuItem key={item} onClick={() => setPriorityFilter(item)}>
                  {item}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-y-0 bg-[#2E6EA0] hover:bg-[#2E6EA0]">
                <TableHead className="w-[132px] px-4 py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Tracking ID</TableHead>
                <TableHead className="w-[120px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Updated</TableHead>
                <TableHead className="w-[180px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Name</TableHead>
                <TableHead className="min-w-[220px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Subject</TableHead>
                <TableHead className="w-[120px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Status</TableHead>
                <TableHead className="w-[170px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Last Replier</TableHead>
                <TableHead className="w-[120px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Priority</TableHead>
                <TableHead className="w-[130px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-slate-500">Loading tickets...</TableCell>
                </TableRow>
              ) : loadError ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-rose-600">{loadError}</TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-slate-500">No tickets found.</TableCell>
                </TableRow>
              ) : (
                filteredRows.map((ticket) => (
                  <TableRow key={ticket.id} className="border-b border-[#C5D5E6] bg-[#F7FAFE] hover:bg-[#EAF2FA]">
                    <TableCell className="px-4 py-3 text-xs font-semibold text-[#2A5D8D] underline underline-offset-2">{ticket.tracking_id}</TableCell>
                    <TableCell className="py-3 text-xs text-[#234A71]">{formatDateLabel(ticket.created_at)}</TableCell>
                    <TableCell className="py-3 text-xs font-medium text-[#1F4469]">{ticket.requester}</TableCell>
                    <TableCell className="py-3 text-xs text-[#2A5D8D] underline underline-offset-2">{ticket.title}</TableCell>
                    <TableCell className={cn("py-3 text-xs font-semibold", statusTextStyles[ticket.status] ?? "text-[#345F85]")}>{ticket.status}</TableCell>
                    <TableCell className="py-3 text-xs text-[#1F4469]">{ticket.technician}</TableCell>
                    <TableCell className="py-3">
                      <Badge className={cn("rounded-sm border px-2 py-0.5 text-[11px] font-semibold", priorityBadgeStyles[ticket.priority] ?? "border-[#9CC4EA] bg-[#DDEEFF] text-[#2E6092]")}>{ticket.priority}</Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="h-8 border-[#93AECA] bg-white text-[#20466D]">
                            Actions
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Ticket #{ticket.id}</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setViewTicket(ticket)}>
                            Open Ticket
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setPriorityTicket(ticket)
                              setNextPriority(ticket.priority)
                            }}
                          >
                            Change Priority
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={ticket.status !== "In Progress"}
                            onClick={() => {
                              void (async () => {
                                try {
                                  await handleSendForReview(ticket.id)
                                  showActionFeedback("success", `Ticket #${ticket.id} moved to Pending Review.`)
                                } catch (actionError) {
                                  showActionFeedback("error", actionError instanceof Error ? actionError.message : "Failed to send ticket for review.")
                                }
                              })()
                            }}
                          >
                            Send For Review
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-[#2E6EA0] focus:text-[#2E6EA0]"
                            disabled={ticket.status === "Pending"}
                            onClick={() => {
                              setEscalationTicket(ticket)
                              setEscalationComment("")
                            }}
                          >
                            Escalate
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={Boolean(viewTicket)} onOpenChange={(open) => !open && setViewTicket(null)}>
        <DialogContent className="flex max-h-[88vh] w-[calc(100vw-1.5rem)] flex-col overflow-hidden border-[#AFC6DF] bg-[#EAF1F8] p-0 sm:max-w-5xl">
          <div className="border-b border-[#96B6D8] bg-gradient-to-r from-[#1F3F6A] via-[#2F5F99] to-[#1E4E89] px-4 py-3 text-white sm:px-5">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold tracking-wide text-white sm:text-xl">Fault Details - Ticket #{viewTicket?.id}</DialogTitle>
              <DialogDescription className="text-xs text-[#D8E8F7] sm:text-sm">
                Move ticket through workflow and send to reporter for final problem review.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3 sm:px-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[#C8D7E8] bg-[#F5F9FE] p-2.5">
                <p className="text-xs font-semibold tracking-wide text-[#506F95] uppercase">Caller</p>
                <p className="mt-1.5 flex items-center gap-2 text-lg font-semibold text-[#203B63] sm:text-xl">
                  <UserRound className="h-4 w-4 text-[#56779D]" />
                  {viewTicket?.requester}
                </p>
              </div>
              <div className="rounded-xl border border-[#C8D7E8] bg-[#F5F9FE] p-2.5">
                <p className="text-xs font-semibold tracking-wide text-[#506F95] uppercase">Status</p>
                <p className="mt-1.5 flex items-center gap-2 text-lg font-semibold text-[#203B63] sm:text-xl">
                  <CircleCheck className="h-4 w-4 text-[#6E59CE]" />
                  {viewTicket?.status}
                  <CircleDot className="h-3.5 w-3.5 text-[#7A61D2]" />
                </p>
              </div>
              <div className="rounded-xl border border-[#C8D7E8] bg-[#F5F9FE] p-2.5">
                <p className="text-xs font-semibold tracking-wide text-[#506F95] uppercase">Priority</p>
                <Badge
                  className={cn(
                    "mt-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold",
                    priorityBadgeStyles[viewTicket?.priority ?? ""] ?? "border-[#9CC4EA] bg-[#DDEEFF] text-[#2E6092]"
                  )}
                >
                  <TriangleAlert className="mr-1 h-3.5 w-3.5" />
                  {viewTicket?.priority}
                </Badge>
              </div>
              <div className="rounded-xl border border-[#C8D7E8] bg-[#F5F9FE] p-2.5">
                <p className="text-xs font-semibold tracking-wide text-[#506F95] uppercase">Last Updated</p>
                <p className="mt-1.5 text-lg font-semibold text-[#203B63] sm:text-xl">
                  {formatDateLabel(viewTicket?.created_at || "")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[#748FB1] sm:text-sm">
              <span className="inline-flex items-center gap-1">
                <CircleCheck className="h-3.5 w-3.5" />
                Opened
              </span>
              <span>|</span>
              <span>Assigned</span>
              <span>|</span>
              <span className="inline-flex items-center gap-1">
                <Wrench className="h-3.5 w-3.5" />
                Assigned to IT
              </span>
              <span>|</span>
              <span className="font-semibold text-[#4B6D95]">{viewTicket?.status ?? "In Progress"}</span>
              <span className="text-[#9AB0CA]">..</span>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_250px]">
              <div className="space-y-2.5">
                <div className="rounded-2xl border border-[#C8D7E8] bg-[#F8FBFF] p-3">
                  <p className="text-xs font-semibold tracking-wide text-[#5A79A1] uppercase">Description</p>
                  <h3 className="mt-1 text-xl font-semibold text-[#203A62] sm:text-2xl">{viewTicket?.title}</h3>
                  <div className="mt-3">
                    <div className="rounded-xl border border-[#D7E3F0] bg-white p-2.5">
                      <p className="mb-2 text-xs font-semibold tracking-wide text-[#5A79A1] uppercase">Ticket Info</p>
                      <div className="space-y-1.5 text-sm text-[#26486F]">
                        <p className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-[#5B7EA5]" />
                          Branch: {viewTicket?.location || "N/A"}
                        </p>
                        <p className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-[#5B7EA5]" />
                          Employee: {viewTicket?.employee_name}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#C8D7E8] bg-[#F8FBFF] p-3">
                  <p className="flex items-center gap-2 text-base font-semibold text-[#203B63] sm:text-lg">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#67A1D3] text-white">..</span>
                    Comment to Employee
                  </p>
                  <textarea
                    className="mt-2 min-h-16 w-full rounded-xl border border-[#D2DEEC] bg-white px-3 py-2 text-sm text-[#26486F]"
                    placeholder="Share an update or instruction for the employee..."
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                  />
                  {commentError ? <p className="mt-2 text-xs text-rose-600">{commentError}</p> : null}
                  {commentSuccess ? <p className="mt-2 text-xs text-emerald-700">{commentSuccess}</p> : null}
                  <div className="mt-3 flex justify-end">
                    <Button
                      onClick={() => void handleCommentSubmit()}
                      disabled={commentSaving}
                      className="bg-[#2E6EA0] text-white hover:bg-[#255C86]"
                    >
                      <MessageSquareMore className="mr-2 h-4 w-4" />
                      {commentSaving ? "Sending..." : "Send Comment"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="rounded-2xl border border-[#C8D7E8] bg-[#F8FBFF] p-3">
                  <p className="text-base font-semibold text-[#203B63] sm:text-lg">Timeline</p>
                  <div className="mt-2 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="inline-flex items-center gap-2 text-sm text-[#4F6F98]">
                        <CircleCheck className="h-3.5 w-3.5 text-[#56A07A]" />
                        Ticket created
                      </p>
                      <p className="text-xs text-[#6E89AA]">{formatDateTime(viewTicket?.created_at || "")}</p>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="inline-flex items-center gap-2 text-sm text-[#4F6F98]">
                        <CircleCheck className="h-3.5 w-3.5 text-[#56A07A]" />
                        Assigned to IT
                      </p>
                      <p className="text-xs text-[#6E89AA]">{viewTicket?.technician || "Pending assignment"}</p>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="inline-flex items-center gap-2 text-sm text-[#4F6F98]">
                        <Clock3 className="h-3.5 w-3.5 text-[#7F97B3]" />
                        {viewTicket?.status}
                      </p>
                      <p className="text-xs text-[#6E89AA]">{formatDateLabel(viewTicket?.created_at || "")}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-[#C8D8EA] bg-[#EDF3F8] px-3 py-2.5 sm:px-4">
            <div className="ml-auto flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Button
                onClick={() => void handleAcceptFromDialog()}
                disabled={!viewTicket || viewTicket.status !== "Pending" || acceptingViewTicket}
                className="min-w-28 bg-[#1E5EA5] text-sm text-white hover:bg-[#174D87]"
              >
                <Check className="mr-2 h-4 w-4" />
                {acceptingViewTicket ? "Accepting..." : "Accept"}
              </Button>
              <Button
                onClick={() => void handleSendForReviewFromDialog()}
                disabled={!viewTicket || viewTicket.status !== "In Progress" || sendingForReview}
                className="min-w-36 bg-[#C7922F] text-sm text-white hover:bg-[#AD7D26]"
              >
                {sendingForReview ? "Sending..." : "Send For Review"}
              </Button>
              <Button
                type="button"
                className="min-w-28 bg-[#D9B43A] text-sm text-[#1B2D4B] hover:bg-[#C9A32F]"
                disabled={!viewTicket || viewTicket.status === "Pending" || viewTicket.status === "Pending Review"}
                onClick={() => {
                  if (!viewTicket) return
                  setEscalationTicket(viewTicket)
                  setEscalationComment("")
                  setViewTicket(null)
                }}
              >
                <TriangleAlert className="mr-2 h-4 w-4" />
                Escalate
              </Button>
              <Button variant="outline" className="min-w-24 border-[#AFC4DD] bg-white text-sm text-[#1C466D] hover:bg-[#EEF5FD]" onClick={() => setViewTicket(null)}>
                <X className="mr-2 h-4 w-4" />
                Close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(priorityTicket)} onOpenChange={(open) => !open && setPriorityTicket(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Priority - Ticket #{priorityTicket?.id}</DialogTitle>
            <DialogDescription>Update the urgency level for this ticket.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Priority</label>
            <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800" value={nextPriority} onChange={(event) => setNextPriority(event.target.value)}>
              {priorityOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={() => void handlePrioritySubmit()} disabled={savingPriority}>{savingPriority ? "Saving..." : "Save Priority"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(escalationTicket)} onOpenChange={(open) => !open && setEscalationTicket(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Escalate Ticket #{escalationTicket?.id}</DialogTitle>
            <DialogDescription>Add escalation notes. Technician rerouting is automatic.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-2">
              <div><p className="text-xs text-slate-500">Caller</p><p className="font-medium text-slate-800">{escalationTicket?.requester}</p></div>
              <div><p className="text-xs text-slate-500">Employee Account</p><p className="font-medium text-slate-800">{escalationTicket?.employee_name}</p></div>
              <div className="md:col-span-2"><p className="text-xs text-slate-500">Fault</p><p className="font-medium text-slate-800">{escalationTicket?.title}</p><p className="mt-1 whitespace-pre-wrap text-slate-700">{escalationTicket?.description || "No description."}</p></div>
            </div>
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              The system will automatically reroute this ticket to the best available technician based on skill and workload.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Escalation Notes</label>
              <textarea className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" value={escalationComment} onChange={(event) => setEscalationComment(event.target.value)} placeholder="Why this fault is being escalated and what checks were done." />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button className="bg-[#2E6EA0] text-white hover:bg-[#255C86]" disabled={escalating} onClick={() => void submitEscalation()}>
              {escalating ? "Escalating..." : "Confirm Escalation"}
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
    </Card>
  )
}


