"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, ChevronDown } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  assignTechnician,
  escalateTicketByAdmin,
  getAllTickets,
  getTechnicians,
  type Technician,
  type Ticket,
  updateTicketCategory,
  updateTicketPriority,
  updateTicketStatus,
} from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"
import { cn } from "@/lib/utils"

type TicketRecord = {
  id: number
  requester: string
  employee_name: string
  caller_name: string
  title: string
  description: string
  location: string
  created_at: string
  category: string
  priority: string
  status: string
  technician: string
  technician_id: number | null
}

const statusOptions = ["Pending", "In Process", "Solved"]
const priorityOptions = ["Low", "Medium", "High", "Critical"]
const categoryOptions = ["HARDWARE", "SOFTWARE", "NETWORK"]

const statusBadgeStyles: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 border border-amber-100",
  "In Process": "bg-blue-50 text-blue-700 border border-blue-100",
  Solved: "bg-emerald-50 text-emerald-700 border border-emerald-100",
}

const priorityBadgeStyles: Record<string, string> = {
  Low: "bg-slate-100 text-slate-700 border border-slate-200",
  Medium: "bg-indigo-50 text-indigo-700 border border-indigo-100",
  High: "bg-orange-50 text-orange-700 border border-orange-100",
  Critical: "bg-rose-50 text-rose-700 border border-rose-100",
}

function normalizeTicketStatus(status: string): string {
  const normalized = status.trim().toLowerCase()
  if (normalized === "open" || normalized === "pending vendor" || normalized === "pending") {
    return "Pending"
  }
  if (normalized === "escalated") {
    return "In Process"
  }
  if (normalized === "in progress" || normalized === "in process") {
    return "In Process"
  }
  if (normalized === "resolved" || normalized === "solved") {
    return "Solved"
  }
  return status
}

function toRow(ticket: Ticket): TicketRecord {
  const requesterName = ticket.caller_name?.trim() || ticket.employee_name || `Employee #${ticket.employee_id}`
  return {
    id: ticket.id,
    requester: requesterName,
    employee_name: ticket.employee_name ?? `Employee #${ticket.employee_id}`,
    caller_name: ticket.caller_name?.trim() || "",
    title: ticket.title,
    description: ticket.description || "",
    location: ticket.location || "",
    created_at: ticket.created_at || "",
    category: ticket.category,
    priority: ticket.priority,
    status: normalizeTicketStatus(ticket.status),
    technician: ticket.technician_name ?? (ticket.technician_id ? `Technician #${ticket.technician_id}` : "Unassigned"),
    technician_id: ticket.technician_id ?? null,
  }
}

export function AdminFaultTicketTable() {
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<TicketRecord[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [statusFilter, setStatusFilter] = useState("All")
  const [priorityFilter, setPriorityFilter] = useState("All")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [viewTicket, setViewTicket] = useState<TicketRecord | null>(null)
  const [escalationTicket, setEscalationTicket] = useState<TicketRecord | null>(null)
  const [escalationTechnicianId, setEscalationTechnicianId] = useState("")
  const [escalationComment, setEscalationComment] = useState("")
  const [escalating, setEscalating] = useState(false)

  useEffect(() => {
    const run = async () => {
      try {
        const [data, technicianData] = await Promise.all([getAllTickets(), getTechnicians()])
        setRows(data.map(toRow))
        setTechnicians(technicianData)
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load tickets.")
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [])

  const filteredRows = rows.filter((ticket) => {
    const search = query.toLowerCase()
    const matchesQuery =
      ticket.title.toLowerCase().includes(search) ||
      ticket.requester.toLowerCase().includes(search) ||
      ticket.technician.toLowerCase().includes(search) ||
      String(ticket.id).includes(search)
    const matchesStatus = statusFilter === "All" || ticket.status === statusFilter
    const matchesPriority = priorityFilter === "All" || ticket.priority === priorityFilter
    return matchesQuery && matchesStatus && matchesPriority
  })

  const refreshRow = async (ticketId: number) => {
    const all = await getAllTickets()
    const updated = all.find((item) => item.id === ticketId)
    if (!updated) {
      return
    }
    setRows((current) => current.map((row) => (row.id === ticketId ? toRow(updated) : row)))
  }

  const handleAssign = async (ticketId: number, technicianId: number | null) => {
    try {
      setError("")
      await assignTechnician(ticketId, technicianId)
      await refreshRow(ticketId)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to assign technician.")
    }
  }

  const handlePriority = async (ticketId: number, priority: string) => {
    try {
      setError("")
      await updateTicketPriority(ticketId, priority)
      await refreshRow(ticketId)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to update priority.")
    }
  }

  const handleCategory = async (ticketId: number, category: string) => {
    try {
      setError("")
      await updateTicketCategory(ticketId, category)
      await refreshRow(ticketId)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to update category.")
    }
  }

  const handleStatus = async (ticketId: number, status: string) => {
    try {
      setError("")
      await updateTicketStatus(ticketId, status)
      await refreshRow(ticketId)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to update status.")
    }
  }

  const handleEscalate = async (ticketId: number) => {
    try {
      setError("")
      await updateTicketStatus(ticketId, "In Process")
      await refreshRow(ticketId)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to receive ticket.")
    }
  }

  const submitEscalation = async () => {
    if (!escalationTicket) {
      return
    }

    const user = getStoredUserSession()
    if (!user || user.role !== "admin_fault") {
      setError("Admin Fault session required. Please login again.")
      return
    }

    if (!escalationTechnicianId) {
      setError("Please choose the technician to escalate to.")
      return
    }

    if (!escalationComment.trim()) {
      setError("Please provide escalation details.")
      return
    }

    try {
      setEscalating(true)
      setError("")
      await escalateTicketByAdmin(
        escalationTicket.id,
        user.id,
        Number(escalationTechnicianId),
        escalationComment.trim()
      )
      await refreshRow(escalationTicket.id)
      setEscalationTicket(null)
      setEscalationTechnicianId("")
      setEscalationComment("")
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to escalate ticket.")
    } finally {
      setEscalating(false)
    }
  }

  return (
    <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="space-y-4 border-b border-slate-100 px-6 py-5">
        <div>
          <CardTitle className="text-base font-semibold text-slate-900">Admin Ticket Table</CardTitle>
          <p className="text-sm text-slate-500">Assign technician, change priority, update status, and escalate.</p>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by ticket, employee, or technician"
            className="max-w-lg"
          />
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-slate-200">
                  Status: {statusFilter}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setStatusFilter("All")}>All</DropdownMenuItem>
                {statusOptions.map((item) => (
                  <DropdownMenuItem key={item} onClick={() => setStatusFilter(item)}>
                    {item}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-slate-200">
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
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-6 text-xs font-semibold tracking-wide text-slate-500 uppercase">Ticket ID</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Caller / Employee</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Category</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Priority</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Status</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Assigned Technician</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="px-6 py-6 text-center text-sm text-slate-500">
                  Loading tickets...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={7} className="px-6 py-6 text-center text-sm text-rose-600">
                  {error}
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="px-6 py-6 text-center text-sm text-slate-500">
                  No tickets found.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="px-6 font-medium text-slate-700">#{ticket.id}</TableCell>
                  <TableCell className="font-medium text-slate-800">{ticket.requester}</TableCell>
                  <TableCell className="text-slate-700">{ticket.category}</TableCell>
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
                    <Badge
                      className={cn(
                        "rounded-full px-2 py-0.5",
                        statusBadgeStyles[ticket.status] ?? "bg-slate-100 text-slate-700 border border-slate-200"
                      )}
                    >
                      {ticket.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-700">{ticket.technician}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="border-slate-200">
                            Assign
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => void handleAssign(ticket.id, null)}>Unassigned</DropdownMenuItem>
                          {technicians.map((option) => (
                            <DropdownMenuItem key={option.id} onClick={() => void handleAssign(ticket.id, option.id)}>
                              {option.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="border-slate-200">
                            Category
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {categoryOptions.map((option) => (
                            <DropdownMenuItem key={option} onClick={() => void handleCategory(ticket.id, option)}>
                              {option}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="border-slate-200">
                            Change Priority
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {priorityOptions.map((option) => (
                            <DropdownMenuItem key={option} onClick={() => void handlePriority(ticket.id, option)}>
                              {option}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="border-slate-200">
                            Status
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {statusOptions.map((option) => (
                            <DropdownMenuItem key={option} onClick={() => void handleStatus(ticket.id, option)}>
                              {option}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                            onClick={() => setViewTicket(ticket)}
                            disabled={ticket.status === "Pending"}
                            title={ticket.status === "Pending" ? "Receive this fault first." : undefined}
                          >
                            Open
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Fault Details - Ticket #{ticket.id}</DialogTitle>
                            <DialogDescription>Review fault details before deciding to solve or escalate.</DialogDescription>
                          </DialogHeader>
                          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-2">
                            <div>
                              <p className="text-xs text-slate-500">Caller</p>
                              <p className="font-medium text-slate-800">{viewTicket?.requester || ticket.requester}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Employee Account</p>
                              <p className="font-medium text-slate-800">{viewTicket?.employee_name || ticket.employee_name}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Category</p>
                              <p className="font-medium text-slate-800">{viewTicket?.category || ticket.category}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Priority</p>
                              <p className="font-medium text-slate-800">{viewTicket?.priority || ticket.priority}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Status</p>
                              <p className="font-medium text-slate-800">{viewTicket?.status || ticket.status}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Location</p>
                              <p className="font-medium text-slate-800">{viewTicket?.location || ticket.location || "N/A"}</p>
                            </div>
                            <div className="md:col-span-2">
                              <p className="text-xs text-slate-500">Title</p>
                              <p className="font-medium text-slate-800">{viewTicket?.title || ticket.title}</p>
                            </div>
                            <div className="md:col-span-2">
                              <p className="text-xs text-slate-500">Description</p>
                              <p className="whitespace-pre-wrap text-slate-700">
                                {viewTicket?.description || ticket.description || "No description."}
                              </p>
                            </div>
                          </div>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline" onClick={() => setViewTicket(null)}>
                                Close
                              </Button>
                            </DialogClose>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                        onClick={() => void handleEscalate(ticket.id)}
                      >
                        Receive
                      </Button>

                      <Dialog
                        open={escalationTicket?.id === ticket.id}
                        onOpenChange={(open) => {
                          if (!open) {
                            setEscalationTicket(null)
                            setEscalationTechnicianId("")
                            setEscalationComment("")
                          } else {
                            setEscalationTicket(ticket)
                          }
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            className="bg-rose-600 text-white hover:bg-rose-700"
                            onClick={() => {
                              setEscalationTicket(ticket)
                              setEscalationTechnicianId("")
                              setEscalationComment("")
                            }}
                            disabled={ticket.status === "Pending"}
                            title={ticket.status === "Pending" ? "Receive this fault first." : undefined}
                          >
                            <AlertTriangle className="h-4 w-4" />
                            Escalate
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Escalate Ticket #{ticket.id}</DialogTitle>
                            <DialogDescription>
                              Review the fault details and choose the technician to escalate this fault to.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-2">
                              <div>
                                <p className="text-xs text-slate-500">Caller</p>
                                <p className="font-medium text-slate-800">{ticket.requester}</p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500">Employee Account</p>
                                <p className="font-medium text-slate-800">{ticket.employee_name}</p>
                              </div>
                              <div className="md:col-span-2">
                                <p className="text-xs text-slate-500">Fault</p>
                                <p className="font-medium text-slate-800">{ticket.title}</p>
                                <p className="mt-1 whitespace-pre-wrap text-slate-700">{ticket.description || "No description."}</p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium text-slate-700">Escalate To (Technician)</label>
                              <select
                                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800"
                                value={escalationTechnicianId}
                                onChange={(event) => setEscalationTechnicianId(event.target.value)}
                              >
                                <option value="">Select technician</option>
                                {technicians.map((option) => (
                                  <option key={option.id} value={String(option.id)}>
                                    {option.name} ({option.branch || "No branch"})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium text-slate-700">Escalation Notes</label>
                              <textarea
                                className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                                value={escalationComment}
                                onChange={(event) => setEscalationComment(event.target.value)}
                                placeholder="Why this fault is being escalated and any troubleshooting already done."
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button className="bg-rose-600 text-white hover:bg-rose-700" disabled={escalating} onClick={() => void submitEscalation()}>
                              {escalating ? "Escalating..." : "Confirm Escalation"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
