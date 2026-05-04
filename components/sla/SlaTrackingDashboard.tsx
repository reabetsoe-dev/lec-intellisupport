"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Clock3, Filter, RefreshCw } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  getAllTickets,
  getPerformanceMetrics,
  type PerformanceMetrics,
  type PerformanceRange,
  type Ticket,
} from "@/lib/api"
import { useAutoRefresh } from "@/lib/use-auto-refresh"

const attentionPalette = ["#16a34a", "#f59e0b", "#dc2626"]
const quickRanges: Array<{ value: PerformanceRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom" },
]

type LiveSlaStatus = "closed" | "healthy" | "awaiting_acceptance" | "at_risk" | "breached"

type LiveTicketSla = {
  ticket: Ticket
  status: LiveSlaStatus
  statusLabel: string
  elapsedMinutes: number
  owner: string
  sortRank: number
}

function rangeLabel(value: PerformanceRange): string {
  return quickRanges.find((item) => item.value === value)?.label ?? "30 Days"
}

function normalizeTicketStatus(status: string): string {
  const normalized = status.trim().toLowerCase()
  if (normalized === "open" || normalized === "pending vendor" || normalized === "pending") return "Pending"
  if (normalized === "in progress" || normalized === "in process" || normalized === "escalated") return "In Progress"
  if (normalized === "pending review" || normalized === "awaiting review") return "Pending Review"
  if (normalized === "resolved" || normalized === "solved") return "Solved"
  return status
}

function parseIsoDate(value?: string | null): Date | null {
  if (!value) {
    return null
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function diffMinutes(from: Date | null, to: Date): number {
  if (!from) {
    return 0
  }
  return Math.max(Math.round((to.getTime() - from.getTime()) / 60000), 0)
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
  }
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}

function sameOrAfter(date: Date, boundary: Date): boolean {
  return date.getTime() >= boundary.getTime()
}

function sameOrBefore(date: Date, boundary: Date): boolean {
  return date.getTime() <= boundary.getTime()
}

function ticketInWindow(ticket: Ticket, metrics: PerformanceMetrics | null): boolean {
  if (!metrics) {
    return true
  }

  const createdAt = parseIsoDate(ticket.created_at)
  if (!createdAt) {
    return false
  }

  const startBoundary = metrics.filters?.start_date ? parseIsoDate(`${metrics.filters.start_date}T00:00:00`) : null
  const endBoundary = metrics.filters?.end_date ? parseIsoDate(`${metrics.filters.end_date}T23:59:59`) : null

  if (startBoundary && !sameOrAfter(createdAt, startBoundary)) {
    return false
  }
  if (endBoundary && !sameOrBefore(createdAt, endBoundary)) {
    return false
  }
  return true
}

function computeLiveTicketSla(ticket: Ticket, metrics: PerformanceMetrics | null, now: Date): LiveTicketSla {
  const status = normalizeTicketStatus(ticket.status)
  const config = metrics?.sla_config
  const acceptanceSlaMinutes = config?.acceptance_sla_minutes ?? 10
  const escalationThresholdMinutes = config?.escalation_threshold_minutes ?? 20

  const assignedAt = parseIsoDate(ticket.assigned_at ?? ticket.created_at)
  const acceptedAt = parseIsoDate(ticket.accepted_at)
  const lastActivityAt = parseIsoDate(ticket.last_activity_at) ?? acceptedAt ?? assignedAt
  const owner = ticket.technician_name || "Admin Fault Queue"

  if (status === "Solved" || status === "Pending Review") {
    return {
      ticket,
      status: "closed",
      statusLabel: "Closed flow",
      elapsedMinutes: 0,
      owner,
      sortRank: 99,
    }
  }

  if (!acceptedAt) {
    const waitMinutes = diffMinutes(assignedAt, now)
    if (waitMinutes > acceptanceSlaMinutes) {
      return {
        ticket,
        status: "breached",
        statusLabel: "Acceptance overdue",
        elapsedMinutes: waitMinutes,
        owner,
        sortRank: 0,
      }
    }
    return {
      ticket,
      status: "awaiting_acceptance",
      statusLabel: "Awaiting acceptance",
      elapsedMinutes: waitMinutes,
      owner,
      sortRank: 2,
    }
  }

  const idleMinutes = diffMinutes(lastActivityAt, now)
  if (idleMinutes > escalationThresholdMinutes) {
    return {
      ticket,
      status: "breached",
      statusLabel: "Inactivity breached",
      elapsedMinutes: idleMinutes,
      owner,
      sortRank: 0,
    }
  }
  if (escalationThresholdMinutes > 0 && idleMinutes / escalationThresholdMinutes >= 0.8) {
    return {
      ticket,
      status: "at_risk",
      statusLabel: "At risk",
      elapsedMinutes: idleMinutes,
      owner,
      sortRank: 1,
    }
  }
  return {
    ticket,
    status: "healthy",
    statusLabel: "Healthy",
    elapsedMinutes: idleMinutes,
    owner,
    sortRank: 3,
  }
}

function badgeClassName(status: LiveSlaStatus): string {
  if (status === "breached") return "border-[#F5C2C7] bg-[#FFF1F2] text-[#B42318]"
  if (status === "at_risk") return "border-[#F8D7A4] bg-[#FFF7ED] text-[#B45309]"
  if (status === "awaiting_acceptance") return "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]"
  if (status === "healthy") return "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]"
  return "border-slate-200 bg-slate-50 text-slate-500"
}

function summaryCardClassName(status: "good" | "warn" | "bad" | "info"): string {
  if (status === "good") return "border-[#B7E4C7] bg-[#F0FDF4]"
  if (status === "warn") return "border-[#F6D7A7] bg-[#FFF7ED]"
  if (status === "bad") return "border-[#F3C0C5] bg-[#FFF1F2]"
  return "border-[#BFDBFE] bg-[#EFF6FF]"
}

export function SlaTrackingDashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedRange, setSelectedRange] = useState<PerformanceRange>("30d")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")

  const loadDashboard = useCallback(async (range: PerformanceRange, startDate?: string, endDate?: string) => {
    try {
      setLoading(true)
      const [metricsPayload, ticketPayload] = await Promise.all([
        getPerformanceMetrics({
          range,
          start_date: startDate,
          end_date: endDate,
        }),
        getAllTickets(),
      ])
      setMetrics(metricsPayload)
      setTickets(ticketPayload)
      setError("")
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load SLA tracking data.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard("30d")
  }, [loadDashboard])

  useAutoRefresh(
    useCallback(async () => {
      if (selectedRange === "custom") {
        await loadDashboard("custom", customStart, customEnd)
        return
      }
      await loadDashboard(selectedRange)
    }, [customEnd, customStart, loadDashboard, selectedRange]),
    {
      enabled: !loading,
      intervalMs: 15000,
    }
  )

  const filteredTickets = useMemo(() => tickets.filter((ticket) => ticketInWindow(ticket, metrics)), [metrics, tickets])

  const liveTicketSla = useMemo(() => {
    const now = new Date()
    return filteredTickets.map((ticket) => computeLiveTicketSla(ticket, metrics, now))
  }, [filteredTickets, metrics])

  const attentionByPriority = useMemo(() => {
    const buckets = new Map<string, number>()
    for (const item of liveTicketSla) {
      if (!["breached", "at_risk", "awaiting_acceptance"].includes(item.status)) {
        continue
      }
      const key = item.ticket.priority || "Unknown"
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
    return Array.from(buckets.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [liveTicketSla])

  const watchlist = useMemo(
    () =>
      liveTicketSla
        .filter((item) => item.status !== "healthy" && item.status !== "closed")
        .sort((a, b) => {
          if (a.sortRank !== b.sortRank) {
            return a.sortRank - b.sortRank
          }
          if (b.elapsedMinutes !== a.elapsedMinutes) {
            return b.elapsedMinutes - a.elapsedMinutes
          }
          return (b.ticket.escalation_level ?? 0) - (a.ticket.escalation_level ?? 0)
        })
        .slice(0, 8),
    [liveTicketSla]
  )

  const slaSummaryData = useMemo(
    () => [
      { name: "Within Target", count: metrics?.sla_summary?.within_target ?? 0 },
      { name: "At Risk", count: metrics?.sla_summary?.at_risk ?? 0 },
      { name: "Breached", count: metrics?.sla_summary?.breached ?? 0 },
    ],
    [metrics]
  )

  const technicianPressure = useMemo(
    () =>
      (metrics?.sla_by_technician ?? [])
        .filter(
          (item) =>
            item.awaiting_acceptance > 0 ||
            item.at_risk > 0 ||
            item.breached > 0 ||
            item.auto_reassigned > 0 ||
            item.escalated > 0
        )
        .sort(
          (a, b) =>
            b.breached - a.breached ||
            b.at_risk - a.at_risk ||
            b.awaiting_acceptance - a.awaiting_acceptance ||
            a.name.localeCompare(b.name)
        )
        .slice(0, 8),
    [metrics]
  )

  const technicianPerformanceScores = useMemo(
    () => (metrics?.technician_performance_scores ?? []).slice(0, 8),
    [metrics]
  )

  const handleRangeSelect = (range: PerformanceRange) => {
    setSelectedRange(range)
    if (range !== "custom") {
      void loadDashboard(range)
    }
  }

  const applyCustomRange = () => {
    if (!customStart || !customEnd) {
      setError("Pick both start and end date for custom SLA filtering.")
      return
    }
    if (customStart > customEnd) {
      setError("Custom start date cannot be after end date.")
      return
    }
    void loadDashboard("custom", customStart, customEnd)
  }

  if (loading && !metrics) {
    return <p className="text-sm text-slate-500">Loading SLA dashboard...</p>
  }

  if (!metrics) {
    return <p className="text-sm text-rose-600">{error || "SLA metrics are unavailable."}</p>
  }

  const operational = metrics.sla_operational
  const config = metrics.sla_config

  return (
    <div className="space-y-6">
      <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
        <CardHeader className="space-y-4 px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline" className="border-slate-200 bg-white text-slate-700">
                  <Filter className="h-4 w-4" />
                  Filter: {rangeLabel(selectedRange)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {quickRanges.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    className={selectedRange === option.value ? "font-semibold text-[#0B1F3A]" : ""}
                    onClick={() => handleRangeSelect(option.value)}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {selectedRange === "custom" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
              <Input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
              <Button type="button" onClick={applyCustomRange} className="bg-[#0B1F3A] text-white hover:bg-[#13315B]">
                Apply
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2 px-6 pb-6 text-sm text-slate-600">
          <p>
            Acceptance SLA: <span className="font-semibold text-[#0B1F3A]">{config?.acceptance_sla_minutes ?? 10}m</span>
            {" | "}
            Reassign threshold: <span className="font-semibold text-[#0B1F3A]">{config?.reassign_threshold_minutes ?? 10}m</span>
            {" | "}
            Inactivity escalation: <span className="font-semibold text-[#0B1F3A]">{config?.escalation_threshold_minutes ?? 20}m</span>
          </p>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {loading ? (
            <p className="inline-flex items-center gap-2 text-xs text-slate-500">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Refreshing SLA metrics...
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className={`rounded-xl py-0 shadow-sm ${summaryCardClassName("good")}`}>
          <CardHeader className="px-6 py-4">
            <CardTitle className="flex items-center gap-2 text-sm text-[#166534]">
              <CheckCircle2 className="h-4 w-4" />
              Within Target
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-[#166534]">{metrics.sla_summary?.within_target ?? 0}</p>
          </CardContent>
        </Card>

        <Card className={`rounded-xl py-0 shadow-sm ${summaryCardClassName("warn")}`}>
          <CardHeader className="px-6 py-4">
            <CardTitle className="flex items-center gap-2 text-sm text-[#B45309]">
              <AlertTriangle className="h-4 w-4" />
              At Risk
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-[#B45309]">{metrics.sla_summary?.at_risk ?? 0}</p>
          </CardContent>
        </Card>

        <Card className={`rounded-xl py-0 shadow-sm ${summaryCardClassName("bad")}`}>
          <CardHeader className="px-6 py-4">
            <CardTitle className="flex items-center gap-2 text-sm text-[#B42318]">
              <AlertTriangle className="h-4 w-4" />
              Breached
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-[#B42318]">{metrics.sla_summary?.breached ?? 0}</p>
          </CardContent>
        </Card>

        <Card className={`rounded-xl py-0 shadow-sm ${summaryCardClassName("info")}`}>
          <CardHeader className="px-6 py-4">
            <CardTitle className="flex items-center gap-2 text-sm text-[#1D4ED8]">
              <Clock3 className="h-4 w-4" />
              Awaiting Acceptance
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-[#1D4ED8]">{operational?.awaiting_acceptance ?? 0}</p>
          </CardContent>
        </Card>

        <Card className={`rounded-xl py-0 shadow-sm ${summaryCardClassName("bad")}`}>
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-[#B42318]">Acceptance Overdue</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-[#B42318]">{operational?.acceptance_overdue ?? 0}</p>
          </CardContent>
        </Card>

        <Card className={`rounded-xl py-0 shadow-sm ${summaryCardClassName("bad")}`}>
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-[#B42318]">Inactivity Breached</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-[#B42318]">{operational?.inactivity_breached ?? 0}</p>
          </CardContent>
        </Card>

        <Card className={`rounded-xl py-0 shadow-sm ${summaryCardClassName("info")}`}>
          <CardHeader className="px-6 py-4">
            <CardTitle className="flex items-center gap-2 text-sm text-[#1D4ED8]">
              <RefreshCw className="h-4 w-4" />
              Auto Reassignments
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-[#1D4ED8]">{operational?.auto_reassigned ?? 0}</p>
          </CardContent>
        </Card>

        <Card className={`rounded-xl py-0 shadow-sm ${summaryCardClassName("warn")}`}>
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-[#B45309]">Average Acceptance</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-[#B45309]">
              {Math.round(operational?.avg_acceptance_minutes ?? 0)}m
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-[#0B1F3A]">SLA Posture</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slaSummaryData} dataKey="count" nameKey="name" outerRadius={110} label>
                    {slaSummaryData.map((item, index) => (
                      <Cell key={item.name} fill={attentionPalette[index % attentionPalette.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-[#0B1F3A]">Priority Queue Under Pressure</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attentionByPriority}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#F97316" radius={[8, 8, 0, 0]}>
                    <LabelList dataKey="count" position="top" fill="#0F172A" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm xl:col-span-2">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-[#0B1F3A]">Technician SLA Load</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <div className="w-full" style={{ height: Math.max(320, technicianPressure.length * 54) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={technicianPressure} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={170} />
                  <Tooltip />
                  <Bar dataKey="awaiting_acceptance" stackId="sla" fill="#3B82F6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="at_risk" stackId="sla" fill="#F59E0B" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="breached" stackId="sla" fill="#DC2626" radius={[0, 8, 8, 0]}>
                    <LabelList dataKey="breached" position="right" fill="#0F172A" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-[#0B1F3A]">Routing Performance Score</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={technicianPerformanceScores} layout="vertical" margin={{ left: 16, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis type="category" dataKey="name" width={150} />
                  <Tooltip
                    formatter={(value, name) => {
                      const numericValue = typeof value === "number" ? value : Number(value ?? 0)
                      const metricName = typeof name === "string" ? name : String(name ?? "")
                      if (metricName === "performance_score_percent") return [`${numericValue}%`, "Performance Score"]
                      return [numericValue, metricName]
                    }}
                  />
                  <Bar dataKey="performance_score_percent" fill="#0F766E" radius={[0, 8, 8, 0]}>
                    <LabelList
                      dataKey="performance_score_percent"
                      position="right"
                      formatter={(value) => `${typeof value === "number" ? value : Number(value ?? 0)}%`}
                      fill="#0F172A"
                      fontSize={11}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-[#0B1F3A]">Score Components</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {technicianPerformanceScores.length === 0 ? (
              <p className="text-sm text-slate-500">No technician scoring data available yet.</p>
            ) : (
              <div className="space-y-3">
                {technicianPerformanceScores.map((item) => (
                  <div key={item.name} className="rounded-xl border border-[#D9E6F4] bg-[#F8FBFF] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#0B1F3A]">{item.name}</p>
                        <p className="text-xs text-[#5F7196]">{item.skillset}</p>
                      </div>
                      <span className="rounded-full bg-[#0F766E] px-2.5 py-1 text-xs font-semibold text-white">
                        Score {item.performance_score_percent}%
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[#36577E] sm:grid-cols-4">
                      <div>
                        <p className="font-medium uppercase tracking-[0.08em]">Success Rate</p>
                        <p className="mt-1 text-sm font-semibold text-[#0B1F3A]">{item.success_rate_percent}%</p>
                      </div>
                      <div>
                        <p className="font-medium uppercase tracking-[0.08em]">Resolution Score</p>
                        <p className="mt-1 text-sm font-semibold text-[#0B1F3A]">{item.resolution_score_percent}%</p>
                      </div>
                      <div>
                        <p className="font-medium uppercase tracking-[0.08em]">Avg Resolution</p>
                        <p className="mt-1 text-sm font-semibold text-[#0B1F3A]">{item.avg_resolution_hours}h</p>
                      </div>
                      <div>
                        <p className="font-medium uppercase tracking-[0.08em]">Completed</p>
                        <p className="mt-1 text-sm font-semibold text-[#0B1F3A]">
                          {item.completed}/{item.total_assigned}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
        <CardHeader className="px-6 py-5">
          <CardTitle className="text-base font-semibold text-[#0B1F3A]">Live Watchlist</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          {watchlist.length === 0 ? (
            <p className="text-sm text-slate-500">No SLA watchlist tickets in the selected time window.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#D7E6F7] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.12em] text-[#6781A1]">
                    <th className="pb-3 pr-4 font-semibold">Ticket</th>
                    <th className="pb-3 pr-4 font-semibold">Owner</th>
                    <th className="pb-3 pr-4 font-semibold">SLA State</th>
                    <th className="pb-3 pr-4 font-semibold">Elapsed</th>
                    <th className="pb-3 pr-4 font-semibold">Reassigns</th>
                    <th className="pb-3 font-semibold">Escalations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDF3FA]">
                  {watchlist.map((item) => (
                    <tr key={item.ticket.id} className="align-top">
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-[#0B1F3A]">#{item.ticket.id} {item.ticket.title}</p>
                        <p className="mt-1 text-xs text-[#5F7196]">{item.ticket.priority} | {normalizeTicketStatus(item.ticket.status)}</p>
                      </td>
                      <td className="py-3 pr-4 text-[#1E3A6D]">{item.owner}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClassName(item.status)}`}>
                          {item.statusLabel}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-[#0B1F3A]">{formatMinutes(item.elapsedMinutes)}</td>
                      <td className="py-3 pr-4 text-[#0B1F3A]">{item.ticket.reassign_count ?? 0}</td>
                      <td className="py-3 text-[#0B1F3A]">{item.ticket.escalation_level ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
