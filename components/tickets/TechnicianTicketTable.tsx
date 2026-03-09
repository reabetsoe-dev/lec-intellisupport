"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { escalateTicket, getAssignedTickets, getTechnicians, type Technician, type Ticket, updateTicketStatus } from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"
import { cn } from "@/lib/utils"

const statusBadgeStyles: Record<string, string> = {
  "In Process": "bg-blue-50 text-blue-700 border border-blue-100",
  Solved: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  Escalated: "bg-amber-50 text-amber-700 border border-amber-100",
}

const priorityBadgeStyles: Record<string, string> = {
  Low: "bg-slate-100 text-slate-700 border border-slate-200",
  Medium: "bg-indigo-50 text-indigo-700 border border-indigo-100",
  High: "bg-orange-50 text-orange-700 border border-orange-100",
  Critical: "bg-rose-50 text-rose-700 border border-rose-100",
}

type TicketViewFilter = "all" | "assigned" | "solved" | "escalated"

type EscalationDraft = {
  ticketId: number
  targetTechnicianId: number | null
  targetLabel: string
  targetRole?: "admin_fault"
}

type EscalationCommentPreview = {
  ticketId: number
  title: string
  comment: string
  by?: string | null
  at?: string | null
}

const filterOptions: { key: TicketViewFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "assigned", label: "Assigned" },
  { key: "solved", label: "Solved" },
  { key: "escalated", label: "Escalated" },
]

const statusUpdateOptions: Array<{ value: string; label: string }> = [
  { value: "In Process", label: "In Process" },
  { value: "Solved", label: "Solved" },
]

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
  if (normalized === "in progress" || normalized === "in process") {
    return "In Process"
  }
  if (normalized === "open" || normalized === "pending vendor" || normalized === "pending") {
    return "Pending"
  }
  return status
}

function getTechnicianDisplayStatus(ticket: Ticket): string {
  const normalized = normalizeTicketStatus(ticket.status)
  if (normalized === "Pending") {
    return ticket.is_currently_assigned_to_me ? "In Process" : "Escalated"
  }
  return normalized
}

function formatEscalationPreviewText(commentText: string, escalatedBy?: string | null): string {
  const normalized = commentText.trim().toLowerCase()
  if (normalized.startsWith("escalated to technician") || normalized.startsWith("escalated to admin fault")) {
    return escalatedBy ? `Escalated by ${escalatedBy}` : "Escalated"
  }
  return commentText
}

export function TechnicianTicketTable() {
  const currentUser = getStoredUserSession()
  const [assignedTickets, setAssignedTickets] = useState<Ticket[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [activeFilter, setActiveFilter] = useState<TicketViewFilter>("all")
  const [loading, setLoading] = useState(true)
  const [escalatingTicketId, setEscalatingTicketId] = useState<number | null>(null)
  const [statusUpdatingTicketId, setStatusUpdatingTicketId] = useState<number | null>(null)
  const [escalationDialogOpen, setEscalationDialogOpen] = useState(false)
  const [escalationComment, setEscalationComment] = useState("")
  const [escalationDraft, setEscalationDraft] = useState<EscalationDraft | null>(null)
  const [commentPreview, setCommentPreview] = useState<EscalationCommentPreview | null>(null)
  const [error, setError] = useState("")

  const loadAssignedTickets = async () => {
    const user = getStoredUserSession()
    if (!user) {
      setError("Session expired. Please login again.")
      setLoading(false)
      return
    }

    const [ticketData, technicianData] = await Promise.all([getAssignedTickets(user.id), getTechnicians()])
    setAssignedTickets(ticketData)
    setTechnicians(technicianData)
  }

  useEffect(() => {
    const run = async () => {
      try {
        await loadAssignedTickets()
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load assigned tickets.")
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [])

  const openEscalationDialog = (
    ticketId: number,
    targetTechnicianId: number | null,
    targetLabel: string,
    targetRole?: "admin_fault"
  ) => {
    setError("")
    setEscalationComment("")
    setEscalationDraft({ ticketId, targetTechnicianId, targetLabel, targetRole })
    setEscalationDialogOpen(true)
  }

  const handleEscalate = async () => {
    if (!escalationDraft) {
      setError("Choose an escalation target first.")
      return
    }

    const user = getStoredUserSession()
    if (!user) {
      setError("Session expired. Please login again.")
      return
    }

    if (!escalationComment.trim()) {
      setError("Escalation comment is required.")
      return
    }

    try {
      setError("")
      setEscalatingTicketId(escalationDraft.ticketId)
      await escalateTicket(
        escalationDraft.ticketId,
        user.id,
        escalationDraft.targetTechnicianId,
        escalationComment.trim(),
        escalationDraft.targetRole
      )
      await loadAssignedTickets()
      setEscalationDialogOpen(false)
      setEscalationComment("")
      setEscalationDraft(null)
    } catch (escalationError) {
      setError(escalationError instanceof Error ? escalationError.message : "Failed to escalate ticket.")
    } finally {
      setEscalatingTicketId(null)
    }
  }

  const handleStatusUpdate = async (ticket: Ticket, nextStatus: string) => {
    if (!ticket.is_currently_assigned_to_me) {
      setError("Only the current owner can update the ticket status.")
      return
    }
    if (getTechnicianDisplayStatus(ticket) === nextStatus) {
      return
    }

    try {
      setError("")
      setStatusUpdatingTicketId(ticket.id)
      await updateTicketStatus(ticket.id, nextStatus)
      await loadAssignedTickets()
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Failed to update ticket status.")
    } finally {
      setStatusUpdatingTicketId(null)
    }
  }

  const escalationTargets = technicians.filter((tech) => tech.user_id !== currentUser?.id)
  const filteredTickets = useMemo(() => {
    if (activeFilter === "all") {
      return assignedTickets
    }
    if (activeFilter === "assigned") {
      return assignedTickets.filter((ticket) => ticket.is_currently_assigned_to_me)
    }
    if (activeFilter === "solved") {
      return assignedTickets.filter((ticket) => getTechnicianDisplayStatus(ticket) === "Solved")
    }
    return assignedTickets.filter((ticket) => ticket.escalated_by_me && !ticket.is_currently_assigned_to_me)
  }, [activeFilter, assignedTickets])

  return (
    <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 px-6 py-5">
        <CardTitle className="text-base font-semibold text-slate-900">Assigned Tickets</CardTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <Button
              key={option.key}
              type="button"
              size="sm"
              variant={activeFilter === option.key ? "default" : "outline"}
              onClick={() => setActiveFilter(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {error ? <p className="px-6 pt-4 text-sm text-rose-600">{error}</p> : null}

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-6 text-xs font-semibold tracking-wide text-slate-500 uppercase">Ticket ID</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Fault Report</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Reporter</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Branch</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Reported At</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Priority</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Status</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Owner / Escalated To</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Escalation Comment</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Escalate</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="px-6 py-6 text-center text-sm text-slate-500">
                  Loading assigned tickets...
                </TableCell>
              </TableRow>
            ) : filteredTickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="px-6 py-6 text-center text-sm text-slate-500">
                  No tickets found for this filter.
                </TableCell>
              </TableRow>
            ) : (
              filteredTickets.map((ticket) => {
                const displayStatus = getTechnicianDisplayStatus(ticket)
                return (
                  <TableRow key={ticket.id}>
                    <TableCell className="px-6 font-medium text-slate-700">#{ticket.id}</TableCell>
                    <TableCell>
                      <div className="max-w-[360px] space-y-1">
                        <Link href={`/technician/tickets/${ticket.id}`} className="font-medium text-slate-800 hover:underline">
                          {ticket.title}
                        </Link>
                        <p className="text-xs text-slate-600">{ticket.description || "No fault description provided."}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-700">{ticket.employee_name ?? `Employee #${ticket.employee_id}`}</TableCell>
                    <TableCell className="text-slate-700">{ticket.location || "N/A"}</TableCell>
                    <TableCell>
                      <Badge className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-700">
                        {formatDateTime(ticket.created_at)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "rounded-full px-2 py-0.5",
                          priorityBadgeStyles[ticket.priority] ?? "bg-slate-100 text-slate-700 border border-slate-200"
                        )}
                      >
                        {ticket.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge
                          className={cn(
                            "rounded-full px-2 py-0.5",
                            statusBadgeStyles[displayStatus] ?? "bg-slate-100 text-slate-700 border border-slate-200"
                          )}
                        >
                          {displayStatus}
                        </Badge>
                        {ticket.is_currently_assigned_to_me ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-slate-200"
                                disabled={statusUpdatingTicketId === ticket.id}
                              >
                                {statusUpdatingTicketId === ticket.id ? "Saving..." : "Change Status"}
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              {statusUpdateOptions.map((option) => (
                                <DropdownMenuItem
                                  key={option.value}
                                  disabled={displayStatus === option.value}
                                  onClick={() => void handleStatusUpdate(ticket, option.value)}
                                >
                                  {option.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-xs">
                        <p className="font-medium text-slate-700">{ticket.current_owner || "Admin Fault Queue"}</p>
                        <p className="text-slate-500">
                          {ticket.is_currently_assigned_to_me ? "Assigned to you" : "Escalated away from your queue"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {ticket.latest_escalation_comment ? (
                        <div className="space-y-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-200"
                            onClick={() =>
                              setCommentPreview({
                                ticketId: ticket.id,
                                title: ticket.title,
                                comment: formatEscalationPreviewText(
                                  ticket.latest_escalation_comment ?? "",
                                  ticket.latest_escalation_by
                                ),
                                by: ticket.latest_escalation_by,
                                at: ticket.latest_escalation_at,
                              })
                            }
                          >
                            View Comment
                          </Button>
                          {ticket.latest_escalation_by ? (
                            <p className="text-xs text-slate-500">From: {ticket.latest_escalation_by}</p>
                          ) : null}
                          {ticket.latest_escalation_target ? (
                            <p className="text-xs text-slate-500">Target: {ticket.latest_escalation_target}</p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">No escalation comment</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-200"
                            disabled={escalatingTicketId === ticket.id || !ticket.is_currently_assigned_to_me}
                          >
                            {escalatingTicketId === ticket.id ? "Escalating..." : "Escalate"}
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {escalationTargets.length === 0 ? (
                            <DropdownMenuItem disabled>No other technicians available</DropdownMenuItem>
                          ) : (
                            escalationTargets.map((target) => (
                              <DropdownMenuItem
                                key={target.id}
                                onClick={() => openEscalationDialog(ticket.id, target.id, target.name)}
                              >
                                {target.name}
                              </DropdownMenuItem>
                            ))
                          )}
                          <DropdownMenuItem onClick={() => openEscalationDialog(ticket.id, null, "Admin Fault", "admin_fault")}>
                            Back to Admin Fault
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {!ticket.is_currently_assigned_to_me ? (
                        <p className="mt-1 text-xs text-slate-500">Only current owner can escalate.</p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={escalationDialogOpen} onOpenChange={setEscalationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalate Ticket</DialogTitle>
            <DialogDescription>
              {escalationDraft
                ? `Add escalation comment for ${escalationDraft.targetLabel}.`
                : "Add an escalation comment."}
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800"
            placeholder="Explain why this ticket is being escalated."
            value={escalationComment}
            onChange={(event) => setEscalationComment(event.target.value)}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEscalationDialogOpen(false)
                setEscalationDraft(null)
                setEscalationComment("")
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleEscalate()} disabled={escalatingTicketId !== null}>
              {escalatingTicketId !== null ? "Escalating..." : "Submit Escalation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(commentPreview)} onOpenChange={(open) => (!open ? setCommentPreview(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {commentPreview ? `Escalation Comment - Ticket #${commentPreview.ticketId}` : "Escalation Comment"}
            </DialogTitle>
            <DialogDescription>{commentPreview ? commentPreview.title : ""}</DialogDescription>
          </DialogHeader>
          {commentPreview ? (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm text-slate-800">{commentPreview.comment}</p>
              <p className="text-xs text-slate-500">{formatDateTime(commentPreview.at)}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCommentPreview(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
