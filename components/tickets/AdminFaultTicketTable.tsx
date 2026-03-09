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
  getAllTickets,
  getTechnicians,
  type Technician,
  type Ticket,
  updateTicketCategory,
  updateTicketPriority,
  updateTicketStatus,
} from "@/lib/api"
import { cn } from "@/lib/utils"

type TicketRecord = {
  id: number
  requester: string
  title: string
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
  return {
    id: ticket.id,
    requester: ticket.employee_name ?? `Employee #${ticket.employee_id}`,
    title: ticket.title,
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
      await updateTicketPriority(ticketId, "Critical")
      await updateTicketStatus(ticketId, "In Process")
      await refreshRow(ticketId)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to escalate ticket.")
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
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Employee</TableHead>
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
                          <Button size="sm" className="bg-rose-600 text-white hover:bg-rose-700">
                            <AlertTriangle className="h-4 w-4" />
                            Escalate
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Escalate Ticket #{ticket.id}</DialogTitle>
                            <DialogDescription>
                              This sets the ticket to Critical priority and In Process status.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <DialogClose asChild>
                              <Button className="bg-rose-600 text-white hover:bg-rose-700" onClick={() => void handleEscalate(ticket.id)}>
                                Confirm Escalation
                              </Button>
                            </DialogClose>
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
