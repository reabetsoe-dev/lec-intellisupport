"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, Printer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getAllTickets,
  getConsumableRequests,
  getConsumableReturns,
  getPerformanceMetrics,
  type PerformanceMetrics,
  type Ticket,
} from "@/lib/api"
import { escapeHtml, openPrintablePdfReport } from "@/lib/pdf-export"
import { useAutoRefresh } from "@/lib/use-auto-refresh"

function normalizeTicketStatus(status: string): string {
  const normalized = status.trim().toLowerCase()
  if (normalized === "open" || normalized === "pending vendor" || normalized === "pending") return "Pending"
  if (normalized === "escalated") return "In Process"
  if (normalized === "in progress" || normalized === "in process") return "In Process"
  if (normalized === "pending review" || normalized === "awaiting review") return "In Process"
  if (normalized === "resolved" || normalized === "solved") return "Solved"
  return status
}

function countByPriority(tickets: Ticket[], priorities: string[]): number {
  const set = new Set(priorities.map((item) => item.toLowerCase()))
  return tickets.filter((ticket) => set.has((ticket.priority || "").toLowerCase())).length
}

export function ManagerDashboardOverview() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [pendingRequestCount, setPendingRequestCount] = useState(0)
  const [pendingReturnCount, setPendingReturnCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadOverview = useCallback(async () => {
    try {
      const [metricsData, ticketsData, requestsData, returnsData] = await Promise.all([
        getPerformanceMetrics(),
        getAllTickets(),
        getConsumableRequests(),
        getConsumableReturns(),
      ])
      setMetrics(metricsData)
      setTickets(ticketsData)
      setPendingRequestCount(requestsData.filter((item) => item.status === "pending").length)
      setPendingReturnCount(returnsData.filter((item) => item.status === "pending").length)
      setError("")
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load manager overview metrics.")
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      await loadOverview()
      setLoading(false)
    }
    void run()
  }, [loadOverview])

  useAutoRefresh(loadOverview, {
    enabled: !loading,
    intervalMs: 15000,
  })

  const statusCounts = useMemo(() => {
    const initial = { pending: 0, inProcess: 0, solved: 0 }
    for (const ticket of tickets) {
      const status = normalizeTicketStatus(ticket.status)
      if (status === "Pending") initial.pending += 1
      if (status === "In Process") initial.inProcess += 1
      if (status === "Solved") initial.solved += 1
    }
    return initial
  }, [tickets])

  const highAndCriticalCount = useMemo(() => countByPriority(tickets, ["High", "Critical"]), [tickets])

  const topWorkload = useMemo(() => {
    if (!metrics) return []
    return [...metrics.by_technician].sort((a, b) => b.count - a.count).slice(0, 5)
  }, [metrics])

  const getOverviewReportOptions = () => {
    if (!metrics) return
    const kpis = [
      { label: "Total Tickets", value: String(metrics.kpis.total_tickets) },
      { label: "Resolved Rate", value: `${metrics.kpis.resolved_rate}%` },
      { label: "Unassigned Tickets", value: String(metrics.kpis.unassigned_tickets) },
      { label: "High/Critical Risk", value: String(highAndCriticalCount) },
      { label: "Pending Consumable Requests", value: String(pendingRequestCount) },
      { label: "Pending Returns", value: String(pendingReturnCount) },
    ]

    const kpiHtml = kpis
      .map(
        (item) =>
          `<div class="kpi"><div class="label">${escapeHtml(item.label)}</div><div class="value">${escapeHtml(
            item.value
          )}</div></div>`
      )
      .join("")

    const statusHtml = `
      <li>Pending: ${statusCounts.pending}</li>
      <li>In Process: ${statusCounts.inProcess}</li>
      <li>Solved: ${statusCounts.solved}</li>
    `

    const workloadRows = topWorkload
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(String(item.count))}</td></tr>`
      )
      .join("")

    return {
      title: "Manager Dashboard Executive Summary",
      subtitle: "LEC IntelliSupport",
      fileName: "manager-dashboard-summary.pdf",
      bodyHtml: `
        <section class="section">
          <h2>KPI Snapshot</h2>
          <div class="kpi-grid">${kpiHtml}</div>
        </section>
        <section class="section">
          <h2>Ticket Status</h2>
          <ul>${statusHtml}</ul>
        </section>
        <section class="section">
          <h2>Workload Queue</h2>
          <table>
            <thead><tr><th>Owner</th><th>Open Tickets</th></tr></thead>
            <tbody>${workloadRows || "<tr><td colspan='2'>No workload data.</td></tr>"}</tbody>
          </table>
        </section>
      `,
    }
  }

  const handlePrintOverview = () => {
    const options = getOverviewReportOptions()
    if (!options) return
    openPrintablePdfReport(options, "print")
  }

  const handleSaveOverviewPdf = () => {
    const options = getOverviewReportOptions()
    if (!options) return
    openPrintablePdfReport(options, "save")
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading manager overview...</p>
  }

  if (error || !metrics) {
    return <p className="text-sm text-rose-600">{error || "Manager overview is unavailable."}</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-[#93AECA] bg-white text-[#20466D] hover:bg-[#EEF5FD]"
            onClick={handlePrintOverview}
          >
            <Printer className="h-4 w-4" />
            Print Summary
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-[#93AECA] bg-white text-[#20466D] hover:bg-[#EEF5FD]"
            onClick={handleSaveOverviewPdf}
          >
            <Download className="h-4 w-4" />
            Download Summary
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-[#1E3A6D]">Total Tickets</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-[#0B1F3A]">{metrics.kpis.total_tickets}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-[#1E3A6D]">Resolved Rate</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-[#0B1F3A]">{metrics.kpis.resolved_rate}%</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-[#1E3A6D]">Unassigned Tickets</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-[#0B1F3A]">{metrics.kpis.unassigned_tickets}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-[#1E3A6D]">High/Critical Risk</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-[#0B1F3A]">{highAndCriticalCount}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-[#1E3A6D]">Pending Consumable Requests</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-[#0B1F3A]">{pendingRequestCount}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-[#1E3A6D]">Pending Returns</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-[#0B1F3A]">{pendingReturnCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-[#0B1F3A]">Ticket Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-[#0072CE]/20 bg-[#F7FBFF] px-3 py-2">
              <span className="font-medium text-[#1E3A6D]">Pending</span>
              <span className="font-semibold text-[#D63C3C]">{statusCounts.pending}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[#0072CE]/20 bg-[#F7FBFF] px-3 py-2">
              <span className="font-medium text-[#1E3A6D]">In Process</span>
              <span className="font-semibold text-[#6D3CC4]">{statusCounts.inProcess}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[#0072CE]/20 bg-[#F7FBFF] px-3 py-2">
              <span className="font-medium text-[#1E3A6D]">Solved</span>
              <span className="font-semibold text-[#1E7A45]">{statusCounts.solved}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-[#0B1F3A]">Workload Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6 text-sm">
            {topWorkload.length === 0 ? (
              <p className="text-slate-500">No workload data available.</p>
            ) : (
              topWorkload.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-lg border border-[#0072CE]/20 bg-[#F7FBFF] px-3 py-2"
                >
                  <span className="font-medium text-[#1E3A6D]">{item.name}</span>
                  <span className="font-semibold text-[#0B1F3A]">{item.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
