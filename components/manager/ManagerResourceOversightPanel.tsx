"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Printer } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getConsumableRequests, getConsumableReturns, type ConsumableRequest, type ConsumableReturn } from "@/lib/api"
import { escapeHtml, openPrintablePdfReport } from "@/lib/pdf-export"

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString()
}

export function ManagerResourceOversightPanel() {
  const [requests, setRequests] = useState<ConsumableRequest[]>([])
  const [returns, setReturns] = useState<ConsumableReturn[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const run = async () => {
      try {
        const [requestData, returnData] = await Promise.all([getConsumableRequests(), getConsumableReturns()])
        setRequests(requestData)
        setReturns(returnData)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load resource oversight data.")
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  const summary = useMemo(
    () => ({
      pendingRequests: requests.filter((item) => item.status === "pending").length,
      approvedRequests: requests.filter((item) => item.status === "approved").length,
      rejectedRequests: requests.filter((item) => item.status === "rejected").length,
      pendingReturns: returns.filter((item) => item.status === "pending").length,
      receivedReturns: returns.filter((item) => item.status === "received").length,
    }),
    [requests, returns]
  )
  const managerFlashcardClass =
    "rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(11,31,58,0.18)]"

  const pendingRequests = requests.filter((item) => item.status === "pending").slice(0, 12)
  const pendingReturns = returns.filter((item) => item.status === "pending").slice(0, 12)

  const getResourceReportOptions = () => {
    const requestRows = requests
      .slice(0, 200)
      .map(
        (item) => `<tr>
          <td>${escapeHtml(item.id)}</td>
          <td>${escapeHtml(item.requestedBy)}</td>
          <td>${escapeHtml(item.department || "N/A")}</td>
          <td>${escapeHtml(item.itemName)}</td>
          <td>${escapeHtml(String(item.quantity))}</td>
          <td>${escapeHtml(item.assignmentType)}</td>
          <td>${escapeHtml(item.status)}</td>
          <td>${escapeHtml(formatDate(item.requestedAt))}</td>
        </tr>`
      )
      .join("")

    const returnRows = returns
      .slice(0, 200)
      .map(
        (item) => `<tr>
          <td>${escapeHtml(`RET-${item.id}`)}</td>
          <td>${escapeHtml(item.employeeName)}</td>
          <td>${escapeHtml(item.itemName)}</td>
          <td>${escapeHtml(String(item.quantity))}</td>
          <td>${escapeHtml(item.status)}</td>
          <td>${escapeHtml(item.reason || "N/A")}</td>
          <td>${escapeHtml(formatDate(item.createdAt))}</td>
        </tr>`
      )
      .join("")

    return {
      title: "Manager Resource Oversight Report",
      subtitle: "Consumable request and return monitoring",
      fileName: "manager-resource-oversight.pdf",
      bodyHtml: `
        <section class="section">
          <h2>Resource Snapshot</h2>
          <div class="kpi-grid">
            <div class="kpi"><div class="label">Pending Requests</div><div class="value">${summary.pendingRequests}</div></div>
            <div class="kpi"><div class="label">Approved Requests</div><div class="value">${summary.approvedRequests}</div></div>
            <div class="kpi"><div class="label">Rejected Requests</div><div class="value">${summary.rejectedRequests}</div></div>
            <div class="kpi"><div class="label">Pending Returns</div><div class="value">${summary.pendingReturns}</div></div>
            <div class="kpi"><div class="label">Received Returns</div><div class="value">${summary.receivedReturns}</div></div>
          </div>
        </section>
        <section class="section">
          <h2>Consumable Requests (${requests.length} rows${requests.length > 200 ? ", first 200 exported" : ""})</h2>
          <table>
            <thead>
              <tr>
                <th>Request</th><th>Employee</th><th>Department</th><th>Item</th><th>Qty</th><th>Type</th><th>Status</th><th>Requested</th>
              </tr>
            </thead>
            <tbody>${requestRows || "<tr><td colspan='8'>No request data.</td></tr>"}</tbody>
          </table>
        </section>
        <section class="section">
          <h2>Consumable Returns (${returns.length} rows${returns.length > 200 ? ", first 200 exported" : ""})</h2>
          <table>
            <thead>
              <tr>
                <th>Return ID</th><th>Employee</th><th>Item</th><th>Qty</th><th>Status</th><th>Reason</th><th>Requested</th>
              </tr>
            </thead>
            <tbody>${returnRows || "<tr><td colspan='7'>No return data.</td></tr>"}</tbody>
          </table>
        </section>
      `,
    }
  }

  const handlePrintResourceReport = () => {
    openPrintablePdfReport(getResourceReportOptions(), "print")
  }

  const handleSaveResourceReport = () => {
    openPrintablePdfReport(getResourceReportOptions(), "save")
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-[#93AECA] bg-white text-[#20466D] hover:bg-[#EEF5FD]"
            onClick={handlePrintResourceReport}
          >
            <Printer className="h-4 w-4" />
            Print Resource Report
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-[#93AECA] bg-white text-[#20466D] hover:bg-[#EEF5FD]"
            onClick={handleSaveResourceReport}
          >
            <Download className="h-4 w-4" />
            Download Resource Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className={managerFlashcardClass}>
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-[#1E3A6D]">Pending Requests</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-3xl font-semibold text-[#0B1F3A]">{summary.pendingRequests}</CardContent>
        </Card>
        <Card className={managerFlashcardClass}>
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-[#1E3A6D]">Approved Requests</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-3xl font-semibold text-[#0B1F3A]">{summary.approvedRequests}</CardContent>
        </Card>
        <Card className={managerFlashcardClass}>
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-[#1E3A6D]">Rejected Requests</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-3xl font-semibold text-[#0B1F3A]">{summary.rejectedRequests}</CardContent>
        </Card>
        <Card className={managerFlashcardClass}>
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-[#1E3A6D]">Pending Returns</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-3xl font-semibold text-[#0B1F3A]">{summary.pendingReturns}</CardContent>
        </Card>
        <Card className={managerFlashcardClass}>
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-[#1E3A6D]">Received Returns</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-3xl font-semibold text-[#0B1F3A]">{summary.receivedReturns}</CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">Pending Consumable Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-6 text-xs font-semibold tracking-wide text-slate-500 uppercase">Request</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Employee</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Item</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Qty</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Type</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Requested</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500">
                    Loading resource data...
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-6 text-center text-sm text-rose-600">
                    {error}
                  </TableCell>
                </TableRow>
              ) : pendingRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500">
                    No pending requests.
                  </TableCell>
                </TableRow>
              ) : (
                pendingRequests.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="px-6 font-medium text-slate-800">{item.id}</TableCell>
                    <TableCell className="text-slate-700">{item.requestedBy}</TableCell>
                    <TableCell className="text-slate-700">{item.itemName}</TableCell>
                    <TableCell className="text-slate-700">{item.quantity}</TableCell>
                    <TableCell className="text-slate-700">
                      <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                        {item.assignmentType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-700">{formatDate(item.requestedAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">Pending Return Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-6 text-xs font-semibold tracking-wide text-slate-500 uppercase">Return ID</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Employee</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Item</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Qty</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Reason</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Requested</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500">
                    Loading return data...
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-6 text-center text-sm text-rose-600">
                    {error}
                  </TableCell>
                </TableRow>
              ) : pendingReturns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500">
                    No pending return requests.
                  </TableCell>
                </TableRow>
              ) : (
                pendingReturns.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="px-6 font-medium text-slate-800">RET-{item.id}</TableCell>
                    <TableCell className="text-slate-700">{item.employeeName}</TableCell>
                    <TableCell className="text-slate-700">{item.itemName}</TableCell>
                    <TableCell className="text-slate-700">{item.quantity}</TableCell>
                    <TableCell className="max-w-[260px] text-xs text-slate-600">{item.reason || "N/A"}</TableCell>
                    <TableCell className="text-slate-700">{formatDate(item.createdAt)}</TableCell>
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
