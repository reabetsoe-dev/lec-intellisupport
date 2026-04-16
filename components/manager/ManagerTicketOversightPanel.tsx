"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { Download, Filter, Printer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getAllTickets, type Ticket } from "@/lib/api"
import { escapeHtml, openPrintablePdfReport } from "@/lib/pdf-export"
import { cn } from "@/lib/utils"

type NormalizedTicket = Ticket & {
  normalized_status: string
}

function normalizeTicketStatus(status: string): string {
  const normalized = status.trim().toLowerCase()
  if (normalized === "open" || normalized === "pending vendor" || normalized === "pending") return "Pending"
  if (normalized === "escalated") return "In Process"
  if (normalized === "in progress" || normalized === "in process") return "In Process"
  if (normalized === "pending review" || normalized === "awaiting review") return "In Process"
  if (normalized === "resolved" || normalized === "solved") return "Solved"
  return status
}

function formatTrackingId(id: number): string {
  return `TK-${String(id).padStart(5, "0")}`
}

function formatDateLabel(isoDate: string | undefined): string {
  if (!isoDate) return "N/A"
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export function ManagerTicketOversightPanel() {
  const router = useRouter()
  const [tickets, setTickets] = useState<NormalizedTicket[]>([])
  const [statusFilter, setStatusFilter] = useState("All")
  const [priorityFilter, setPriorityFilter] = useState("All")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const run = async () => {
      try {
        const data = await getAllTickets()
        setTickets(data.map((ticket) => ({ ...ticket, normalized_status: normalizeTicketStatus(ticket.status) })))
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load ticket oversight data.")
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  const openTicketWorkspace = (ticketId: number) => {
    router.push(`/manager/tickets/${ticketId}`)
  }

  const handleTicketRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, ticketId: number) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return
    }
    event.preventDefault()
    openTicketWorkspace(ticketId)
  }

  const summary = useMemo(
    () => ({
      pending: tickets.filter((ticket) => ticket.normalized_status === "Pending").length,
      inProcess: tickets.filter((ticket) => ticket.normalized_status === "In Process").length,
      solved: tickets.filter((ticket) => ticket.normalized_status === "Solved").length,
      unassigned: tickets.filter((ticket) => !ticket.technician_id).length,
    }),
    [tickets]
  )

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const matchesStatus = statusFilter === "All" || ticket.normalized_status === statusFilter
      const matchesPriority = priorityFilter === "All" || ticket.priority === priorityFilter
      return matchesStatus && matchesPriority
    })
  }, [tickets, statusFilter, priorityFilter])

  const getTicketReportOptions = () => {
    const tableRows = filteredTickets
      .slice(0, 200)
      .map((ticket) => {
        const reporter = ticket.caller_name || ticket.employee_name || `Employee #${ticket.employee_id}`
        const technician = ticket.technician_name || "Admin Fault Queue"
        return `<tr>
          <td>${escapeHtml(formatTrackingId(ticket.id))}</td>
          <td>${escapeHtml(formatDateLabel(ticket.updated_at))}</td>
          <td>${escapeHtml(reporter)}</td>
          <td>${escapeHtml(ticket.title || "")}</td>
          <td>${escapeHtml(ticket.category || "General IT Support")}</td>
          <td>${escapeHtml(ticket.normalized_status)}</td>
          <td>${escapeHtml(ticket.priority || "N/A")}</td>
          <td>${escapeHtml(technician)}</td>
        </tr>`
      })
      .join("")

    return {
      title: "Manager Ticket Oversight Report",
      subtitle: `Filters: status=${statusFilter}, priority=${priorityFilter}`,
      fileName: "manager-ticket-oversight.pdf",
      bodyHtml: `
        <section class="section">
          <h2>Snapshot</h2>
          <div class="kpi-grid">
            <div class="kpi"><div class="label">Pending</div><div class="value">${summary.pending}</div></div>
            <div class="kpi"><div class="label">In Process</div><div class="value">${summary.inProcess}</div></div>
            <div class="kpi"><div class="label">Solved</div><div class="value">${summary.solved}</div></div>
            <div class="kpi"><div class="label">Unassigned</div><div class="value">${summary.unassigned}</div></div>
          </div>
        </section>
        <section class="section">
          <h2>Ticket Table (${filteredTickets.length} rows${filteredTickets.length > 200 ? ", first 200 exported" : ""})</h2>
          <table>
            <thead>
              <tr>
                <th>Tracking ID</th>
                <th>Updated</th>
                <th>Reporter</th>
                <th>Subject</th>
                <th>Category</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Technician</th>
              </tr>
            </thead>
            <tbody>${tableRows || "<tr><td colspan='8'>No tickets found.</td></tr>"}</tbody>
          </table>
        </section>
      `,
    }
  }

  const handlePrintTicketReport = () => {
    openPrintablePdfReport(getTicketReportOptions(), "print")
  }

  const handleSaveTicketReport = () => {
    openPrintablePdfReport(getTicketReportOptions(), "save")
  }

  return (
    <Card className="rounded-xl border-[#9CB8D3] bg-[#EDF3F9] py-0 shadow-sm">
      <CardHeader className="space-y-4 border-b border-[#B7CBE0] bg-[#E1EBF5] px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded border border-[#7997B5] bg-[#F1F6FB] px-2 py-1 text-xs font-semibold text-[#234A71]">
            Pending {summary.pending}
          </span>
          <span className="inline-flex items-center rounded border border-[#7997B5] bg-[#F1F6FB] px-2 py-1 text-xs font-semibold text-[#234A71]">
            In Process {summary.inProcess}
          </span>
          <span className="inline-flex items-center rounded border border-[#7997B5] bg-[#F1F6FB] px-2 py-1 text-xs font-semibold text-[#234A71]">
            Solved {summary.solved}
          </span>
          <span className="inline-flex items-center rounded border border-[#7997B5] bg-[#F1F6FB] px-2 py-1 text-xs font-semibold text-[#234A71]">
            Unassigned {summary.unassigned}
          </span>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="border-[#93AECA] bg-white text-[#20466D] hover:bg-[#EEF5FD]"
              >
                <Filter className="h-4 w-4" />
                Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 border-[#93AECA] bg-white">
              <DropdownMenuLabel className="text-xs font-semibold tracking-wide text-[#234A71] uppercase">
                Status
              </DropdownMenuLabel>
              {["All", "Pending", "In Process", "Solved"].map((option) => (
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
              {["All", "Low", "Medium", "High", "Critical"].map((option) => (
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
          <Button
            type="button"
            variant="outline"
            className="border-[#93AECA] bg-white text-[#20466D] hover:bg-[#EEF5FD]"
            onClick={handlePrintTicketReport}
          >
            <Printer className="h-4 w-4" />
            Print Report
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-[#93AECA] bg-white text-[#20466D] hover:bg-[#EEF5FD]"
            onClick={handleSaveTicketReport}
          >
            <Download className="h-4 w-4" />
            Download Report
          </Button>
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
                <TableHead className="w-[180px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Reporter
                </TableHead>
                <TableHead className="min-w-[220px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Subject
                </TableHead>
                <TableHead className="w-[160px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Category
                </TableHead>
                <TableHead className="w-[120px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Status
                </TableHead>
                <TableHead className="w-[120px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Priority
                </TableHead>
                <TableHead className="w-[170px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Technician
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
              ) : filteredTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-slate-500">
                    No tickets found for your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTickets.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => openTicketWorkspace(ticket.id)}
                    onKeyDown={(event) => handleTicketRowKeyDown(event, ticket.id)}
                    className="cursor-pointer border-b border-[#C5D5E6] bg-[#F7FAFE] hover:bg-[#EAF2FA] focus-visible:bg-[#EAF2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E6EA0]"
                  >
                    <TableCell className="px-4 py-3 text-xs font-semibold text-[#2A5D8D]">
                      <Link
                        href={`/manager/tickets/${ticket.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="underline underline-offset-2"
                      >
                        {formatTrackingId(ticket.id)}
                      </Link>
                    </TableCell>
                    <TableCell className="py-3 text-xs text-[#234A71]">{formatDateLabel(ticket.updated_at)}</TableCell>
                    <TableCell className="py-3 text-xs font-medium text-[#1F4469]">
                      {ticket.caller_name || ticket.employee_name || `Employee #${ticket.employee_id}`}
                    </TableCell>
                    <TableCell className="py-3 text-xs text-[#2A5D8D]">{ticket.title}</TableCell>
                    <TableCell className="py-3 text-xs font-medium text-[#1F4469]">
                      {ticket.category || "General IT Support"}
                    </TableCell>
                    <TableCell className="py-3 text-xs font-semibold text-[#345F85]">{ticket.normalized_status}</TableCell>
                    <TableCell className="py-3 text-xs font-semibold text-[#345F85]">{ticket.priority}</TableCell>
                    <TableCell className="py-3 text-xs text-[#1F4469]">
                      {ticket.technician_name || "Admin Fault Queue"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
