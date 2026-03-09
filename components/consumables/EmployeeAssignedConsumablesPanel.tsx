"use client"

import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getConsumableRequests, type ConsumableRequest } from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"

function formatDate(value?: string | null): string {
  if (!value) {
    return "N/A"
  }
  return new Date(value).toLocaleString()
}

function toDisplayLabel(value: string): string {
  return value
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ")
}

export function EmployeeAssignedConsumablesPanel() {
  const [approvedRequests, setApprovedRequests] = useState<ConsumableRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const user = getStoredUserSession()

  useEffect(() => {
    const run = async () => {
      if (!user?.id) {
        setError("Session expired. Please login again.")
        setLoading(false)
        return
      }

      try {
        const data = await getConsumableRequests(user.id)
        setApprovedRequests(data.filter((request) => request.status === "approved"))
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load assigned consumables.")
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [user?.id])

  const rows = useMemo(() => {
    return [...approvedRequests].sort((a, b) => {
      const aTime = new Date(a.approvedAt ?? a.requestedAt).getTime()
      const bTime = new Date(b.approvedAt ?? b.requestedAt).getTime()
      return bTime - aTime
    })
  }, [approvedRequests])

  return (
    <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-[#0072CE]/15 px-6 py-5">
        <CardTitle className="text-base font-semibold text-[#0B1F3A]">My Consumables</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-6 text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Item</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Quantity</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Department</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Approved By</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Approved At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="px-6 py-6 text-center text-sm text-[#1E3A6D]">
                  Loading assigned consumables...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="px-6 py-6 text-center text-sm text-[#D71920]">
                  {error}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="px-6 py-6 text-center text-sm text-[#1E3A6D]">
                  No consumables have been assigned to your profile yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="px-6 font-medium text-[#0B1F3A]">{toDisplayLabel(request.itemName)}</TableCell>
                  <TableCell className="text-[#0B1F3A]">{request.quantity}</TableCell>
                  <TableCell>
                    <Badge className="rounded-full border border-[#0072CE]/35 bg-[#E9F3FF] text-[#0B1F3A]">
                      {request.department || "N/A"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[#0B1F3A]">{request.approvedBy || "Admin"}</TableCell>
                  <TableCell className="text-[#0B1F3A]">{formatDate(request.approvedAt ?? request.requestedAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
