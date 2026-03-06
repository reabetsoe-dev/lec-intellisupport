"use client"

import { useEffect, useState } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getUserTickets, type Ticket } from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"
import { cn } from "@/lib/utils"

const statusBadgeStyles: Record<string, string> = {
  Open: "bg-slate-100 text-slate-700 border border-slate-200",
  "In Progress": "bg-blue-50 text-blue-700 border border-blue-100",
  "Pending Vendor": "bg-amber-50 text-amber-700 border border-amber-100",
  Resolved: "bg-emerald-50 text-emerald-700 border border-emerald-100",
}

const priorityBadgeStyles: Record<string, string> = {
  Low: "bg-slate-100 text-slate-700 border border-slate-200",
  Medium: "bg-indigo-50 text-indigo-700 border border-indigo-100",
  High: "bg-orange-50 text-orange-700 border border-orange-100",
  Critical: "bg-rose-50 text-rose-700 border border-rose-100",
}

export function EmployeeTicketHistoryTable() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const run = async () => {
      const user = getStoredUserSession()
      if (!user) {
        setError("Session expired. Please login again.")
        setLoading(false)
        return
      }

      try {
        const data = await getUserTickets(user.id)
        setTickets(data)
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load tickets.")
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [])

  const rows = tickets

  return (
    <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 px-6 py-5">
        <CardTitle className="text-base font-semibold text-slate-900">My Submitted Tickets</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
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
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="px-6 py-6 text-center text-sm text-slate-500">
                  Loading tickets...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="px-6 py-6 text-center text-sm text-rose-600">
                  {error}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="px-6 py-6 text-center text-sm text-slate-500">
                  No submitted tickets found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="px-6 font-medium text-slate-700">#{ticket.id}</TableCell>
                  <TableCell className="font-medium text-slate-800">{ticket.title}</TableCell>
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
                    <Badge className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-700">
                      {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : "N/A"}
                    </Badge>
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
