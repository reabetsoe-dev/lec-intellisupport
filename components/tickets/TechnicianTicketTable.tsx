"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Filter } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getAssignedTickets, type Ticket } from "@/lib/api"
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
    return "Pending Review"
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
    updated: ticket.created_at || "",
    priority: ticket.priority,
    status: normalizeTicketStatus(ticket.status),
    escalationTarget: ticket.latest_escalation_target || "Current queue",
    raw: ticket,
  }
}

export function TechnicianTicketTable() {
  const [assignedTickets, setAssignedTickets] = useState<Ticket[]>([])
  const [activeFilter, setActiveFilter] = useState<TicketViewFilter>("all")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  const [commentPreview, setCommentPreview] = useState<EscalationCommentPreview | null>(null)

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
      solved: assignedTickets.filter((ticket) => normalizeTicketStatus(ticket.status) === "Solved").length,
    }),
    [assignedTickets]
  )

  return (
    <Card className="rounded-xl border border-[#9CB8D3] bg-[#EDF3F9] py-0 shadow-sm">
      <CardHeader className="space-y-4 border-b border-[#B7CBE0] bg-[#E1EBF5] px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded border border-[#C89A4D] bg-[#FFF2DE] px-2 py-1 text-xs font-semibold text-[#8B5A12]">
            Pending {summary.pending}
          </span>
          <span className="inline-flex items-center rounded border border-[#2D5A84] bg-[#163A5A] px-2 py-1 text-xs font-semibold text-white">
            In Progress {summary.inProgress}
          </span>
          <span className="inline-flex items-center rounded border border-[#7997B5] bg-[#F1F6FB] px-2 py-1 text-xs font-semibold text-[#234A71]">
            Solved {summary.solved}
          </span>
        </div>

        <div className="flex justify-start">
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

      <CardContent className="p-0 [&_th]:whitespace-normal [&_td]:align-top [&_td]:whitespace-normal [&_td]:break-words">
        <Table className="min-w-[1080px] table-fixed">
          <TableHeader>
            <TableRow className="border-y-0 bg-[#2E6EA0] hover:bg-[#2E6EA0]">
              <TableHead className="w-[132px] px-4 py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Tracking ID</TableHead>
              <TableHead className="w-[120px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Updated</TableHead>
              <TableHead className="w-[180px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Reporter</TableHead>
              <TableHead className="min-w-[220px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Subject</TableHead>
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
                    <div className="space-y-1">
                      <Link href={`/technician/tickets/${ticket.id}`} className="font-semibold underline underline-offset-2">
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
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" className="h-8 border-[#93AECA] bg-white text-[#20466D]" asChild>
                        <Link href={`/technician/tickets/${ticket.id}`}>Open</Link>
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
    </Card>
  )
}
