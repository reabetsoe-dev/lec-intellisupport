"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Filter,
  ChevronDown,
  X,
} from "lucide-react"

import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getTicketById, getUserTickets, submitTicketProblemReview, type Ticket, type TicketDetail } from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"
import { useAutoRefresh } from "@/lib/use-auto-refresh"
import { cn } from "@/lib/utils"

type TicketRecord = {
  id: number
  trackingId: string
  title: string
  description: string
  category: string
  location: string
  priority: string
  status: string
  technician: string
  createdAt: string
  updatedAt: string
  employeeName: string
}

const priorityOptions = ["All", "Low", "Medium", "High", "Critical"]
const statusOptions = ["All", "Pending", "In Progress", "Pending Review", "Solved"]

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

function normalizeEmployeeStatus(status: string): string {
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

function formatDateLabel(value?: string | null): string {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function formatDateTime(value?: string | null): string {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

function toDateValue(value?: string | null): number {
  if (!value) return 0
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function formatAssignee(technicianName?: string | null): string {
  const cleanName = (technicianName || "").trim()
  return cleanName || "Support Team"
}

function normalizeName(value?: string | null): string {
  return (value || "").trim().toLowerCase()
}

function formatReporterUpdateText(commentText: string, authorName: string, currentUserName?: string | null): string {
  const text = commentText.trim()
  const isReporterSelf = normalizeName(authorName) !== "" && normalizeName(authorName) === normalizeName(currentUserName)

  if (!isReporterSelf) {
    return text
  }

  const approvedMatch = text.match(/^Reporter problem review approved \(rating (\d)\/5\):\s*(.*)$/i)
  if (approvedMatch) {
    const rating = approvedMatch[1]
    const detail = (approvedMatch[2] || "")
      .replace(/^Reporter\s+approved\s+the\s+fix\s+and\s+confirmed\s+resolution\.?/i, "")
      .replace(/^Reporter\s+/i, "")
      .trim()
    return detail
      ? `You approved the final review (rating ${rating}/5). ${detail}`
      : `You approved the final review (rating ${rating}/5).`
  }

  const rejectedMatch = text.match(/^Reporter problem review rejected \(rating (\d)\/5\):\s*(.*)$/i)
  if (rejectedMatch) {
    const rating = rejectedMatch[1]
    const detail = (rejectedMatch[2] || "")
      .replace(/^Reporter\s+requested\s+additional\s+work\s+before\s+closure\.?/i, "")
      .replace(/^Reporter\s+/i, "")
      .trim()
    return detail
      ? `You requested more work (rating ${rating}/5). ${detail}`
      : `You requested more work (rating ${rating}/5).`
  }

  return text
}

function toRow(ticket: Ticket): TicketRecord {
  return {
    id: ticket.id,
    trackingId: formatTrackingId(ticket.id),
    title: ticket.title,
    description: ticket.description || "",
    category: ticket.category || "General IT Support",
    location: ticket.location || "",
    priority: ticket.priority,
    status: normalizeEmployeeStatus(ticket.status),
    technician: formatAssignee(ticket.technician_name),
    createdAt: ticket.created_at || "",
    updatedAt: ticket.updated_at || ticket.created_at || "",
    employeeName: ticket.employee_name ?? `Employee #${ticket.employee_id}`,
  }
}

export function EmployeeTicketHistoryTable() {
  const currentUserName = getStoredUserSession()?.name ?? ""
  const [rows, setRows] = useState<TicketRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [priorityFilter, setPriorityFilter] = useState("All")
  const [statusFilter, setStatusFilter] = useState("All")
  const [selectedRow, setSelectedRow] = useState<TicketRecord | null>(null)
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState("")
  const [reviewComment, setReviewComment] = useState("")
  const [reviewRating, setReviewRating] = useState("")
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [resultDialog, setResultDialog] = useState<{
    open: boolean
    status: "success" | "error"
    message: string
  }>({
    open: false,
    status: "success",
    message: "",
  })

  const showResultDialog = (status: "success" | "error", message: string) => {
    setResultDialog({
      open: true,
      status,
      message,
    })
  }

  const loadTickets = useCallback(async () => {
    const user = getStoredUserSession()
    if (!user) {
      setError("Session expired. Please login again.")
      return
    }

    try {
      const tickets = await getUserTickets(user.id)
      setRows(
        tickets
          .map(toRow)
          .sort((left, right) => toDateValue(right.updatedAt) - toDateValue(left.updatedAt))
      )
      setError("")
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load tickets.")
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

  const refreshOpenTicketDetail = useCallback(async () => {
    if (!selectedRow) {
      return
    }
    try {
      const detail = await getTicketById(selectedRow.id)
      setTicketDetail(detail)
      setDetailError("")
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : "Failed to load ticket details.")
    }
  }, [selectedRow])

  useAutoRefresh(refreshOpenTicketDetail, {
    enabled: Boolean(selectedRow) && !detailLoading && !reviewSubmitting,
    intervalMs: 10000,
  })

  const filteredRows = rows.filter((ticket) => {
    const matchesPriority = priorityFilter === "All" || ticket.priority === priorityFilter
    const matchesStatus = statusFilter === "All" || ticket.status === statusFilter

    return matchesPriority && matchesStatus
  })

  const summary = {
    total: rows.length,
    pending: rows.filter((row) => row.status === "Pending").length,
    inProgress: rows.filter((row) => row.status === "In Progress").length,
    pendingReview: rows.filter((row) => row.status === "Pending Review").length,
    solved: rows.filter((row) => row.status === "Solved").length,
  }

  const openTicketDetails = async (ticket: TicketRecord) => {
    setSelectedRow(ticket)
    setTicketDetail(null)
    setDetailError("")
    setDetailLoading(true)

    try {
      const detail = await getTicketById(ticket.id)
      setTicketDetail(detail)
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : "Failed to load ticket details.")
    } finally {
      setDetailLoading(false)
    }
  }

  const closeTicketDetails = () => {
    setSelectedRow(null)
    setTicketDetail(null)
    setDetailError("")
    setDetailLoading(false)
    setReviewComment("")
    setReviewRating("")
  }

  const detailStatus = ticketDetail ? normalizeEmployeeStatus(ticketDetail.status) : selectedRow?.status ?? "Pending"

  const submitProblemReview = async (approved: boolean) => {
    if (!ticketDetail) {
      return
    }

    const user = getStoredUserSession()
    if (!user || user.role !== "employee") {
      showResultDialog("error", "Employee session required. Please login again.")
      return
    }

    if (!approved && !reviewComment.trim()) {
      showResultDialog("error", "Please explain what still needs to be fixed.")
      return
    }
    if (!reviewRating) {
      showResultDialog("error", "Please provide a rating (1 to 5) for this review.")
      return
    }

    try {
      setReviewSubmitting(true)
      await submitTicketProblemReview(ticketDetail.id, {
        reporter_id: user.id,
        approved,
        rating: Number(reviewRating),
        review_comment: reviewComment.trim() || undefined,
      })

      const refreshedTicket = await getTicketById(ticketDetail.id)
      setTicketDetail(refreshedTicket)
      await loadTickets()
      setReviewComment("")
      setReviewRating("")
      showResultDialog(
        "success",
        approved
          ? `Ticket #${ticketDetail.id} marked as solved after your problem review.`
          : `Ticket #${ticketDetail.id} sent back to In Progress for more work.`
      )
    } catch (submitError) {
      showResultDialog("error", submitError instanceof Error ? submitError.message : "Failed to submit problem review.")
    } finally {
      setReviewSubmitting(false)
    }
  }

  return (
    <Card className="rounded-xl border border-[#9CB8D3] bg-[#EDF3F9] py-0 shadow-sm">
      <CardHeader className="space-y-4 border-b border-[#B7CBE0] bg-[#E1EBF5] px-4 py-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#203B63]">My Submitted Tickets</h3>
            <span className="text-xs text-[#5E7FA6]">Track status, assignment, and priority at a glance</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded border border-[#2D5A84] bg-[#163A5A] px-2 py-1 text-xs font-semibold text-white hover:border-[#2D5A84] hover:bg-[#163A5A] hover:text-white hover:shadow-none">
              Total {summary.total}
            </span>
            <span className="inline-flex items-center rounded border border-[#D9A2A2] bg-[#FFEAEA] px-2 py-1 text-xs font-semibold text-[#A33C3C]">
              Pending {summary.pending}
            </span>
            <span className="inline-flex items-center rounded border border-[#B9A5E9] bg-[#F1EBFF] px-2 py-1 text-xs font-semibold text-[#5E3AA0]">
              In Progress {summary.inProgress}
            </span>
            <span className="inline-flex items-center rounded border border-[#D9C38D] bg-[#FFF7E5] px-2 py-1 text-xs font-semibold text-[#8B5A12]">
              Pending Review {summary.pendingReview}
            </span>
            <span className="inline-flex items-center rounded border border-[#9ED4B2] bg-[#ECF9F1] px-2 py-1 text-xs font-semibold text-[#1E7A45]">
              Solved {summary.solved}
            </span>
          </div>
        </div>

        <div className="flex justify-start">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="border-[#93AECA] bg-white text-[#20466D]">
                <Filter className="h-4 w-4" />
                Filter
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 border-[#93AECA] bg-white">
              <DropdownMenuLabel className="text-xs font-semibold tracking-wide text-[#234A71] uppercase">
                Status
              </DropdownMenuLabel>
              {statusOptions.map((option) => (
                <DropdownMenuItem
                  key={`status-${option}`}
                  className={cn(
                    "text-[#20466D]",
                    statusFilter === option && "bg-[#E8F1FB] font-semibold text-[#173F66]"
                  )}
                  onClick={() => setStatusFilter(option)}
                >
                  {option}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-semibold tracking-wide text-[#234A71] uppercase">
                Priority
              </DropdownMenuLabel>
              {priorityOptions.map((option) => (
                <DropdownMenuItem
                  key={`priority-${option}`}
                  className={cn(
                    "text-[#20466D]",
                    priorityFilter === option && "bg-[#E8F1FB] font-semibold text-[#173F66]"
                  )}
                  onClick={() => setPriorityFilter(option)}
                >
                  {option}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="font-medium text-[#173F66]"
                onClick={() => {
                  setStatusFilter("All")
                  setPriorityFilter("All")
                }}
              >
                Reset filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-y-0 bg-[#2E6EA0] hover:bg-[#2E6EA0]">
                <TableHead className="w-[132px] px-4 py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Tracking ID
                </TableHead>
                <TableHead className="w-[120px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Updated
                </TableHead>
                <TableHead className="min-w-[250px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Subject
                </TableHead>
                <TableHead className="w-[150px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Branch
                </TableHead>
                <TableHead className="w-[130px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Status
                </TableHead>
                <TableHead className="w-[180px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Assigned To
                </TableHead>
                <TableHead className="w-[120px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Priority
                </TableHead>
                <TableHead className="w-[110px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-slate-500">
                    Loading tickets...
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-rose-600">
                    {error}
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-6 py-8 text-center text-sm text-[#234A71]">
                    No tickets match the current search or filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((ticket) => (
                  <TableRow key={ticket.id} className="border-b border-[#C5D5E6] bg-[#F7FAFE] hover:bg-[#EAF2FA]">
                    <TableCell className="px-4 py-3 text-xs font-semibold text-[#2A5D8D] underline underline-offset-2">
                      {ticket.trackingId}
                    </TableCell>
                    <TableCell className="py-3 text-xs text-[#234A71]">
                      {formatDateLabel(ticket.updatedAt)}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-[#1F4469]">{ticket.title}</p>
                        <p className="text-[11px] text-[#5E7FA6]">{ticket.category}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-xs text-[#1F4469]">
                      {ticket.location || "N/A"}
                    </TableCell>
                    <TableCell className={cn("py-3 text-xs font-semibold", statusTextStyles[ticket.status] ?? "text-[#345F85]")}>
                      {ticket.status}
                    </TableCell>
                    <TableCell className="py-3 text-xs text-[#1F4469]">
                      {ticket.technician}
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
                    <TableCell className="py-2">
                      <Button size="sm" variant="outline" onClick={() => void openTicketDetails(ticket)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={Boolean(selectedRow)} onOpenChange={(open) => !open && closeTicketDetails()}>
        <DialogContent className="flex max-h-[88vh] w-[calc(100vw-1.5rem)] flex-col overflow-hidden border-[#AFC6DF] bg-[#EAF1F8] p-0 sm:max-w-5xl">
          <div className="border-b border-[#96B6D8] bg-gradient-to-r from-[#1F3F6A] via-[#2F5F99] to-[#1E4E89] px-4 py-3 text-white sm:px-5">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold tracking-wide text-white sm:text-xl">
                Fault Details - Ticket #{selectedRow?.id}
              </DialogTitle>
              <DialogDescription className="text-xs text-[#D8E8F7] sm:text-sm">
                Simple reporter view with only the key details and latest updates.
              </DialogDescription>
            </DialogHeader>
          </div>

          {detailLoading ? (
            <div className="px-4 py-6 text-sm text-[#234A71]">Loading ticket details...</div>
          ) : detailError ? (
            <div className="px-4 py-6 text-sm text-rose-600">{detailError}</div>
          ) : ticketDetail ? (
            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4">
              <div className="rounded-2xl border border-[#C8D7E8] bg-white p-3">
                <p className="text-base font-semibold text-[#203B63]">Ticket Summary</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-[#D7E3F0] bg-[#F8FBFF] px-3 py-2">
                    <p className="text-[11px] font-semibold tracking-wide text-[#5A79A1] uppercase">Reporter</p>
                    <p className="mt-1 text-sm font-semibold text-[#203B63]">{ticketDetail.employee_name ?? selectedRow?.employeeName}</p>
                  </div>
                  <div className="rounded-lg border border-[#D7E3F0] bg-[#F8FBFF] px-3 py-2">
                    <p className="text-[11px] font-semibold tracking-wide text-[#5A79A1] uppercase">Tracking ID</p>
                    <p className="mt-1 text-sm font-semibold text-[#203B63]">{formatTrackingId(ticketDetail.id)}</p>
                  </div>
                  <div className="rounded-lg border border-[#D7E3F0] bg-[#F8FBFF] px-3 py-2">
                    <p className="text-[11px] font-semibold tracking-wide text-[#5A79A1] uppercase">Status</p>
                    <p className={cn("mt-1 text-sm font-semibold", statusTextStyles[detailStatus] ?? "text-[#203B63]")}>{detailStatus}</p>
                  </div>
                  <div className="rounded-lg border border-[#D7E3F0] bg-[#F8FBFF] px-3 py-2">
                    <p className="text-[11px] font-semibold tracking-wide text-[#5A79A1] uppercase">Priority</p>
                    <p className="mt-1 text-sm font-semibold text-[#203B63]">{ticketDetail.priority}</p>
                  </div>
                  <div className="rounded-lg border border-[#D7E3F0] bg-[#F8FBFF] px-3 py-2">
                    <p className="text-[11px] font-semibold tracking-wide text-[#5A79A1] uppercase">Assigned To</p>
                    <p className="mt-1 text-sm font-semibold text-[#203B63]">{formatAssignee(ticketDetail.technician_name)}</p>
                  </div>
                  <div className="rounded-lg border border-[#D7E3F0] bg-[#F8FBFF] px-3 py-2">
                    <p className="text-[11px] font-semibold tracking-wide text-[#5A79A1] uppercase">Category</p>
                    <p className="mt-1 text-sm font-semibold text-[#203B63]">{ticketDetail.category || "General IT Support"}</p>
                  </div>
                  <div className="rounded-lg border border-[#D7E3F0] bg-[#F8FBFF] px-3 py-2">
                    <p className="text-[11px] font-semibold tracking-wide text-[#5A79A1] uppercase">Branch</p>
                    <p className="mt-1 text-sm font-semibold text-[#203B63]">{ticketDetail.location || "N/A"}</p>
                  </div>
                  <div className="rounded-lg border border-[#D7E3F0] bg-[#F8FBFF] px-3 py-2">
                    <p className="text-[11px] font-semibold tracking-wide text-[#5A79A1] uppercase">Reported</p>
                    <p className="mt-1 text-sm font-semibold text-[#203B63]">{formatDateTime(ticketDetail.created_at)}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-[#6E89AA]">
                  Last updated: {formatDateTime(ticketDetail.updated_at || ticketDetail.created_at)}
                </p>
              </div>

              <div className="rounded-2xl border border-[#C8D7E8] bg-white p-3">
                <p className="text-base font-semibold text-[#203B63]">Issue</p>
                <h3 className="mt-1 text-lg font-semibold text-[#203A62] sm:text-xl">{ticketDetail.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#26486F]">
                  {ticketDetail.description || "No description provided."}
                </p>
              </div>

              <div className="rounded-2xl border border-[#C8D7E8] bg-white p-3">
                <p className="text-base font-semibold text-[#203B63]">Latest Updates</p>
                <div className="mt-2 space-y-2.5">
                  {ticketDetail.comments.length === 0 ? (
                    <p className="text-sm text-[#5E7FA6]">No updates yet.</p>
                  ) : (
                    [...ticketDetail.comments]
                      .sort((left, right) => toDateValue(left.created_at) - toDateValue(right.created_at))
                      .map((comment) => (
                      <div key={comment.id} className="rounded-xl border border-[#D2DEEC] bg-[#F8FBFF] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-[#203B63]">{comment.author_name}</p>
                          <p className="text-xs text-[#6E89AA]">{formatDateTime(comment.created_at)}</p>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-[#26486F]">
                          {formatReporterUpdateText(comment.comment, comment.author_name, currentUserName)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {detailStatus === "Pending Review" ? (
                <div className="rounded-2xl border border-[#D9C38D] bg-[#FFF8E8] p-3">
                  <p className="text-base font-semibold text-[#7A4B08] sm:text-lg">Final Problem Review</p>
                  <p className="mt-2 text-sm text-[#7A4B08]">
                    Confirm whether the issue is fully resolved before the ticket is closed. Rating is required.
                  </p>
                  <div className="mt-3">
                    <label className="text-sm font-medium text-[#7A4B08]">Rating (1-5)</label>
                    <select
                      className="mt-1 h-10 w-full rounded-md border border-[#DCC9A2] bg-white px-3 text-sm text-[#26486F]"
                      value={reviewRating}
                      onChange={(event) => setReviewRating(event.target.value)}
                    >
                      <option value="">Select rating</option>
                      <option value="5">5 - Excellent</option>
                      <option value="4">4 - Good</option>
                      <option value="3">3 - Fair</option>
                      <option value="2">2 - Poor</option>
                      <option value="1">1 - Very Poor</option>
                    </select>
                  </div>
                  <textarea
                    className="mt-3 min-h-20 w-full rounded-md border border-[#DCC9A2] bg-white px-3 py-2 text-sm text-[#26486F]"
                    placeholder="Add optional feedback (required if sending back for more work)."
                    value={reviewComment}
                    onChange={(event) => setReviewComment(event.target.value)}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      onClick={() => void submitProblemReview(true)}
                      disabled={reviewSubmitting}
                      className="bg-[#1E7A45] text-white hover:bg-[#18643A]"
                    >
                      {reviewSubmitting ? "Submitting..." : "Approve & Close"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void submitProblemReview(false)}
                      disabled={reviewSubmitting}
                      className="border-[#C67A2E] bg-white text-[#9A5A15] hover:bg-[#FFF3E5]"
                    >
                      Needs More Work
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="shrink-0 border-t border-[#C8D8EA] bg-[#EDF3F8] px-3 py-2.5 sm:px-4">
            <div className="ml-auto flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Button variant="outline" onClick={closeTicketDetails}>
                <X className="mr-2 h-4 w-4" />
                Close
              </Button>
            </div>
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
