"use client"

import { useMemo, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  priorityBadgeStyles,
  priorityOptions,
  slaBadgeStyles,
  statusBadgeStyles,
  statusOptions,
  tickets,
  type TicketPriority,
  type TicketStatus,
} from "@/components/tickets/ticket-data"
import { ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

export function TicketTable() {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<TicketStatus | "All">("All")
  const [priority, setPriority] = useState<TicketPriority | "All">("All")

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const matchesQuery =
        ticket.title.toLowerCase().includes(query.toLowerCase()) ||
        String(ticket.id).includes(query) ||
        ticket.technician.toLowerCase().includes(query.toLowerCase())
      const matchesStatus = status === "All" || ticket.status === status
      const matchesPriority = priority === "All" || ticket.priority === priority

      return matchesQuery && matchesStatus && matchesPriority
    })
  }, [priority, query, status])

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-6 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full max-w-lg">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            placeholder="Search by ticket, title, or technician"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 border-slate-200 pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-slate-200 text-slate-700">
                Status: {status}
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setStatus("All")}>All</DropdownMenuItem>
              {statusOptions.map((option) => (
                <DropdownMenuItem key={option} onClick={() => setStatus(option)}>
                  {option}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-slate-200 text-slate-700">
                Priority: {priority}
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Priority</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPriority("All")}>All</DropdownMenuItem>
              {priorityOptions.map((option) => (
                <DropdownMenuItem key={option} onClick={() => setPriority(option)}>
                  {option}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-6 text-xs font-semibold tracking-wide text-slate-500 uppercase">Ticket ID</TableHead>
            <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Title</TableHead>
            <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Status</TableHead>
            <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Priority</TableHead>
            <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">SLA</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredTickets.map((ticket) => (
            <TableRow key={ticket.id} className="cursor-pointer hover:bg-slate-50">
              <TableCell className="px-6 font-medium text-slate-600">#{ticket.id}</TableCell>
              <TableCell>
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="font-medium text-slate-800 transition-colors hover:text-slate-950 hover:underline"
                >
                  {ticket.title}
                </Link>
              </TableCell>
              <TableCell>
                <Badge className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusBadgeStyles[ticket.status])}>
                  {ticket.status}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  className={cn("rounded-full px-2 py-0.5 text-xs font-medium", priorityBadgeStyles[ticket.priority])}
                >
                  {ticket.priority}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge className={cn("rounded-full px-2 py-0.5 text-xs font-medium", slaBadgeStyles[ticket.sla])}>
                  {ticket.sla}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {filteredTickets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-sm text-slate-500">
                No tickets match your current filters.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  )
}
