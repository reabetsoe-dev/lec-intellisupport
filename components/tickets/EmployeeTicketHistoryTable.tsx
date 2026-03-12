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
  Pending: "bg-[#FFECEF] text-[#B1121A] border border-[#D71920]/25",
  "In Process": "bg-[#D9EBFF] text-[#0B1F3A] border border-[#0072CE]/35",
  Solved: "bg-[#EAF8F0] text-[#007A3D] border border-[#007A3D]/25",
}

function normalizeEmployeeStatus(status: string): string {
  const normalized = status.trim().toLowerCase()
  if (normalized === "open" || normalized === "pending vendor" || normalized === "pending" || normalized === "escalated") {
    return "Pending"
  }
  if (normalized === "in progress" || normalized === "in process") {
    return "In Process"
  }
  if (normalized === "resolved" || normalized === "solved") {
    return "Solved"
  }
  return status
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
    <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-[#0072CE]/15 px-6 py-5">
        <CardTitle className="text-base font-semibold text-[#0B1F3A]">My Submitted Tickets</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-6 text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Ticket ID</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Title</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="px-6 py-6 text-center text-sm text-[#1E3A6D]">
                  Loading tickets...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={3} className="px-6 py-6 text-center text-sm text-[#D71920]">
                  {error}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="px-6 py-6 text-center text-sm text-[#1E3A6D]">
                  No submitted tickets found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((ticket) => {
                const displayStatus = normalizeEmployeeStatus(ticket.status)
                return (
                  <TableRow key={ticket.id}>
                    <TableCell className="px-6 font-medium text-[#0B1F3A]">#{ticket.id}</TableCell>
                    <TableCell className="font-medium text-[#0B1F3A]">{ticket.title}</TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "rounded-full px-2 py-0.5",
                          statusBadgeStyles[displayStatus] ?? "bg-[#EAF3FF] text-[#0B1F3A] border border-[#0072CE]/30"
                        )}
                      >
                        {displayStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
