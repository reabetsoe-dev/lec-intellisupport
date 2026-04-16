"use client"

import { useEffect, useMemo, useState } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getConsumableReturns, type ConsumableReturn } from "@/lib/api"

function fmtDate(value?: string | null): string {
  if (!value) {
    return "N/A"
  }
  return new Date(value).toLocaleString()
}

export function AdminConsumableReturnHistoryPanel() {
  const [rows, setRows] = useState<ConsumableReturn[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const run = async () => {
      try {
        setError("")
        const data = await getConsumableReturns()
        setRows(data)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load consumable returns.")
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [])

  const filteredRows = useMemo(() => {
    return [...rows]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [rows])

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, item) => {
        acc.total += 1
        acc[item.status] += 1
        acc.quantity += item.quantity
        return acc
      },
      { total: 0, pending: 0, received: 0, rejected: 0, quantity: 0 }
    )
  }, [filteredRows])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="rounded-xl border border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-4"><CardTitle className="text-sm font-semibold text-[#1E3A6D]">Total Returns</CardTitle></CardHeader>
          <CardContent className="px-6 pb-6 text-2xl font-semibold text-[#0B1F3A]">{summary.total}</CardContent>
        </Card>
        <Card className="rounded-xl border border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-4"><CardTitle className="text-sm font-semibold text-[#1E3A6D]">Pending</CardTitle></CardHeader>
          <CardContent className="px-6 pb-6 text-2xl font-semibold text-amber-700">{summary.pending}</CardContent>
        </Card>
        <Card className="rounded-xl border border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-4"><CardTitle className="text-sm font-semibold text-[#1E3A6D]">Received</CardTitle></CardHeader>
          <CardContent className="px-6 pb-6 text-2xl font-semibold text-emerald-700">{summary.received}</CardContent>
        </Card>
        <Card className="rounded-xl border border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-4"><CardTitle className="text-sm font-semibold text-[#1E3A6D]">Total Quantity</CardTitle></CardHeader>
          <CardContent className="px-6 pb-6 text-2xl font-semibold text-[#0B1F3A]">{summary.quantity}</CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border border-[#0072CE]/25 bg-[#F7FBFF] py-0 shadow-sm">
        <CardHeader className="border-b border-[#BBD1E8] px-6 py-5">
          <CardTitle className="text-base font-semibold text-[#0B1F3A]">Return History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? <p className="px-6 py-4 text-sm text-[#B42318]">{error}</p> : null}
          <Table>
            <TableHeader>
              <TableRow className="border-y-0 bg-[#2E6EA0] hover:bg-[#2E6EA0]">
                <TableHead className="px-6 text-[11px] font-semibold tracking-wide text-white uppercase">Return ID</TableHead>
                <TableHead className="text-[11px] font-semibold tracking-wide text-white uppercase">Status</TableHead>
                <TableHead className="text-[11px] font-semibold tracking-wide text-white uppercase">Employee</TableHead>
                <TableHead className="text-[11px] font-semibold tracking-wide text-white uppercase">Item</TableHead>
                <TableHead className="text-[11px] font-semibold tracking-wide text-white uppercase">Type</TableHead>
                <TableHead className="text-[11px] font-semibold tracking-wide text-white uppercase">Qty</TableHead>
                <TableHead className="text-[11px] font-semibold tracking-wide text-white uppercase">Reason</TableHead>
                <TableHead className="text-[11px] font-semibold tracking-wide text-white uppercase">Created</TableHead>
                <TableHead className="text-[11px] font-semibold tracking-wide text-white uppercase">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="px-6 py-6 text-center text-sm text-[#5B7898]">
                    Loading return history...
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="px-6 py-6 text-center text-sm text-[#5B7898]">
                    No return records found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((item) => (
                  <TableRow key={item.id} className="border-b border-[#C5D5E6] bg-[#F7FAFE] hover:bg-[#EAF2FA]">
                    <TableCell className="px-6 font-medium text-[#1F4469]">RET-{item.id}</TableCell>
                    <TableCell className="text-[#234A71]">{item.status}</TableCell>
                    <TableCell className="text-[#234A71]">{item.employeeName}</TableCell>
                    <TableCell className="text-[#234A71]">{item.itemName}</TableCell>
                    <TableCell className="text-[#234A71]">{item.assignmentType}</TableCell>
                    <TableCell className="text-[#234A71]">{item.quantity}</TableCell>
                    <TableCell className="max-w-[260px] text-xs text-[#2B4B6B]">{item.reason || "N/A"}</TableCell>
                    <TableCell className="text-xs text-[#2B4B6B]">{fmtDate(item.createdAt)}</TableCell>
                    <TableCell className="max-w-[260px] text-xs text-[#2B4B6B]">
                      {item.status === "received"
                        ? `Received by ${item.receivedBy ?? "Admin"} on ${fmtDate(item.receivedAt)}`
                        : item.status === "rejected"
                          ? `Rejected by ${item.rejectedBy ?? "Admin"} on ${fmtDate(item.rejectedAt)}. Reason: ${item.rejectionReason ?? "N/A"}`
                          : "Pending review"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
