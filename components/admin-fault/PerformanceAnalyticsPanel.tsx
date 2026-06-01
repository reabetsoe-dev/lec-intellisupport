"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  CircleUserRound,
  ClipboardList,
  Clock3,
  Download,
  Filter,
  LogIn,
  LogOut,
  QrCode,
  UserRound,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  getPerformanceMetrics,
  type PerformanceMetrics,
  type PerformanceRange,
  type TechnicianActivitySummaryDatum,
} from "@/lib/api"
import { cn } from "@/lib/utils"

const chartPalette = ["#0ea5e9", "#f97316", "#22c55e", "#e11d48", "#a855f7", "#14b8a6", "#facc15"]

const quickRanges: Array<{ value: PerformanceRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "Monthly" },
  { value: "90d", label: "Quarterly" },
  { value: "365d", label: "Yearly" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom" },
]

type CsvRow = Record<string, string | number>
type KpiTone = "sky" | "amber" | "rose" | "violet" | "cyan" | "teal" | "purple" | "orange" | "emerald" | "slate"

type KpiCardItem = {
  label: string
  value: number
  comparisonValue?: number
  description?: string
  icon: LucideIcon
  tone: KpiTone
}

const kpiToneStyles: Record<KpiTone, { bubble: string; icon: string }> = {
  sky: { bubble: "bg-sky-50", icon: "text-sky-600" },
  amber: { bubble: "bg-amber-50", icon: "text-amber-600" },
  rose: { bubble: "bg-rose-50", icon: "text-rose-600" },
  violet: { bubble: "bg-violet-50", icon: "text-violet-600" },
  cyan: { bubble: "bg-cyan-50", icon: "text-cyan-600" },
  teal: { bubble: "bg-teal-50", icon: "text-teal-600" },
  purple: { bubble: "bg-purple-50", icon: "text-purple-600" },
  orange: { bubble: "bg-orange-50", icon: "text-orange-600" },
  emerald: { bubble: "bg-emerald-50", icon: "text-emerald-600" },
  slate: { bubble: "bg-slate-100", icon: "text-slate-600" },
}

function downloadCsv(filename: string, rows: CsvRow[]) {
  if (rows.length === 0) {
    return
  }

  const headers = Object.keys(rows[0])
  const lines = [headers.join(",")]
  for (const row of rows) {
    lines.push(headers.map((header) => JSON.stringify(row[header] ?? "")).join(","))
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function downloadChartAsPng(filename: string, container: HTMLDivElement | null) {
  if (!container) {
    return
  }

  const svg = container.querySelector("svg")
  if (!svg) {
    return
  }

  const serializer = new XMLSerializer()
  const source = serializer.serializeToString(svg)
  const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" })
  const svgUrl = URL.createObjectURL(svgBlob)
  const image = new Image()

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("Failed to render chart image."))
    image.src = svgUrl
  })

  const canvas = document.createElement("canvas")
  canvas.width = Math.max(svg.clientWidth, 900)
  canvas.height = Math.max(svg.clientHeight, 420)
  const context = canvas.getContext("2d")
  if (!context) {
    URL.revokeObjectURL(svgUrl)
    return
  }

  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const pngUrl = canvas.toDataURL("image/png")
  const link = document.createElement("a")
  link.href = pngUrl
  link.download = filename
  link.click()
  URL.revokeObjectURL(svgUrl)
}

function ChartActions({
  title,
  csvRows,
  containerRef,
}: {
  title: string
  csvRows: CsvRow[]
  containerRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-slate-200"
        disabled={csvRows.length === 0}
        onClick={() => downloadCsv(`${title.toLowerCase().replace(/\s+/g, "_")}.csv`, csvRows)}
      >
        <Download className="h-4 w-4" />
        CSV
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-slate-200"
        onClick={() => void downloadChartAsPng(`${title.toLowerCase().replace(/\s+/g, "_")}.png`, containerRef.current)}
      >
        <Download className="h-4 w-4" />
        PNG
      </Button>
    </div>
  )
}

function rangeLabel(value: PerformanceRange): string {
  return quickRanges.find((item) => item.value === value)?.label ?? "Monthly"
}

function pieLabelRenderer({ name, value }: { name?: string; value?: number }) {
  return `${name ?? ""}: ${value ?? 0}`
}

function formatCount(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US").format(value ?? 0)
}

function calculateTrendPercent(current: number, comparison: number | undefined): number {
  if (typeof comparison !== "number" || !Number.isFinite(comparison)) {
    return 0
  }
  if (comparison <= 0) {
    return current > 0 ? 100 : 0
  }

  return Math.round(((current - comparison) / comparison) * 100)
}

function KpiCard({ item }: { item: KpiCardItem }) {
  const Icon = item.icon
  const tone = kpiToneStyles[item.tone]
  const trendPercent = calculateTrendPercent(item.value, item.comparisonValue)
  const trendIsNegative = trendPercent < 0
  const TrendIcon = trendIsNegative ? ArrowDown : ArrowUp

  return (
    <Card className="min-h-[112px] rounded-md border-[#E2EAF4] bg-white py-0 shadow-[0_10px_26px_-22px_rgba(15,23,42,0.65)]">
      <CardContent className="flex h-full flex-col justify-between px-4 py-3">
        <div className="flex items-start gap-3">
          <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", tone.bubble)}>
            <Icon className={cn("h-5 w-5", tone.icon)} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-[#1A2E4B]">{item.label}</p>
            <p className="mt-1 text-2xl font-bold leading-7 text-[#0B1F3A]">{formatCount(item.value)}</p>
          </div>
        </div>

        {item.description ? (
          <p className="mt-3 truncate text-[11px] text-[#64748B]">{item.description}</p>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-[11px]">
            <span className={cn("inline-flex items-center gap-1 font-semibold", trendIsNegative ? "text-rose-600" : "text-emerald-600")}>
              <TrendIcon className="h-3 w-3" />
              {Math.abs(trendPercent)}%
            </span>
            <span className="text-[#64748B]">vs last 7 days</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function formatHours(value: number): string {
  return `${value.toFixed(2)}h`
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Not recorded yet"
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function formatDurationMinutes(value: number | null | undefined): string {
  if (!value || value <= 0) {
    return "0m"
  }

  const hours = Math.floor(value / 60)
  const minutes = value % 60
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`
  }
  if (hours > 0) {
    return `${hours}h`
  }
  return `${minutes}m`
}

export function PerformanceAnalyticsPanel() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [comparisonMetrics, setComparisonMetrics] = useState<PerformanceMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedRange, setSelectedRange] = useState<PerformanceRange>("30d")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")

  const priorityChartRef = useRef<HTMLDivElement>(null)
  const statusChartRef = useRef<HTMLDivElement>(null)
  const workloadChartRef = useRef<HTMLDivElement>(null)
  const technicianTimeChartRef = useRef<HTMLDivElement>(null)

  const loadMetrics = useCallback(async (range: PerformanceRange, startDate?: string, endDate?: string) => {
    try {
      setLoading(true)
      const payload = await getPerformanceMetrics({
        range,
        start_date: startDate,
        end_date: endDate,
      })
      let comparisonPayload: PerformanceMetrics | null = null
      try {
        comparisonPayload =
          range === "7d" && !startDate && !endDate
            ? payload
            : await getPerformanceMetrics({ range: "7d" })
      } catch {
        comparisonPayload = null
      }
      setMetrics(payload)
      setComparisonMetrics(comparisonPayload)
      setError("")
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load KPI data.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMetrics("30d")
  }, [loadMetrics])

  const technicianBreakdown = useMemo(
    () =>
      (metrics?.technician_breakdown ?? [])
        .slice()
        .sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name)),
    [metrics]
  )
  const technicianActivitySummary = useMemo(
    () => (metrics?.technician_activity_summary ?? []).slice(),
    [metrics]
  )
  const technicianRecentActivity = metrics?.technician_recent_activity ?? []
  const staleOpenTickets = metrics?.kpis.stale_open_tickets ?? 0
  const technicianCheckIns = metrics?.kpis.technician_check_ins ?? 0
  const technicianCheckOuts = metrics?.kpis.technician_check_outs ?? 0
  const currentlyCheckedIn = metrics?.kpis.currently_checked_in_technicians ?? 0
  const technicianActivityEvents = metrics?.kpis.technician_activity_events ?? 0
  const troubleshootingAnalytics = metrics?.troubleshooting_analytics
  const totalQrScans = troubleshootingAnalytics?.total_qr_scans ?? metrics?.kpis.total_qr_scans ?? 0
  const totalTroubleshootingAttempts =
    troubleshootingAnalytics?.total_troubleshooting_attempts ?? metrics?.kpis.total_troubleshooting_attempts ?? 0
  const totalSystemSolvedIssues =
    troubleshootingAnalytics?.total_system_solved_issues ?? metrics?.kpis.total_system_solved_issues ?? 0
  const totalFailedTroubleshootingReports =
    troubleshootingAnalytics?.total_failed_troubleshooting_reports ??
    metrics?.kpis.total_failed_troubleshooting_reports ??
    0
  const comparisonTroubleshootingAnalytics = comparisonMetrics?.troubleshooting_analytics
  const comparisonStaleOpenTickets = comparisonMetrics?.kpis.stale_open_tickets ?? 0
  const comparisonTechnicianCheckIns = comparisonMetrics?.kpis.technician_check_ins ?? 0
  const comparisonTechnicianCheckOuts = comparisonMetrics?.kpis.technician_check_outs ?? 0
  const comparisonTotalQrScans =
    comparisonTroubleshootingAnalytics?.total_qr_scans ?? comparisonMetrics?.kpis.total_qr_scans ?? 0
  const comparisonTotalTroubleshootingAttempts =
    comparisonTroubleshootingAnalytics?.total_troubleshooting_attempts ??
    comparisonMetrics?.kpis.total_troubleshooting_attempts ??
    0
  const comparisonTotalSystemSolvedIssues =
    comparisonTroubleshootingAnalytics?.total_system_solved_issues ??
    comparisonMetrics?.kpis.total_system_solved_issues ??
    0
  const comparisonTotalFailedTroubleshootingReports =
    comparisonTroubleshootingAnalytics?.total_failed_troubleshooting_reports ??
    comparisonMetrics?.kpis.total_failed_troubleshooting_reports ??
    0

  const kpiCards = useMemo<KpiCardItem[]>(
    () => [
      {
        label: "Total Tickets",
        value: metrics?.kpis.total_tickets ?? 0,
        comparisonValue: comparisonMetrics?.kpis.total_tickets,
        icon: ClipboardList,
        tone: "sky",
      },
      {
        label: "Unassigned Tickets",
        value: metrics?.kpis.unassigned_tickets ?? 0,
        comparisonValue: comparisonMetrics?.kpis.unassigned_tickets,
        icon: CircleUserRound,
        tone: "amber",
      },
      {
        label: "Open > 48h",
        value: staleOpenTickets,
        comparisonValue: comparisonStaleOpenTickets,
        icon: Clock3,
        tone: "rose",
      },
      {
        label: "Technician Check-Ins",
        value: technicianCheckIns,
        comparisonValue: comparisonTechnicianCheckIns,
        icon: UserRound,
        tone: "violet",
      },
      {
        label: "Technician Check-Outs",
        value: technicianCheckOuts,
        comparisonValue: comparisonTechnicianCheckOuts,
        icon: LogOut,
        tone: "cyan",
      },
      {
        label: "Currently Checked In",
        value: currentlyCheckedIn,
        description: `${technicianActivityEvents} technician activity events in range`,
        icon: LogIn,
        tone: "teal",
      },
      {
        label: "QR Scans",
        value: totalQrScans,
        comparisonValue: comparisonTotalQrScans,
        icon: QrCode,
        tone: "purple",
      },
      {
        label: "Troubleshooting Attempts",
        value: totalTroubleshootingAttempts,
        comparisonValue: comparisonTotalTroubleshootingAttempts,
        icon: Wrench,
        tone: "orange",
      },
      {
        label: "System-Solved Issues",
        value: totalSystemSolvedIssues,
        comparisonValue: comparisonTotalSystemSolvedIssues,
        icon: CheckCircle2,
        tone: "emerald",
      },
      {
        label: "Failed Troubleshooting Reports",
        value: totalFailedTroubleshootingReports,
        comparisonValue: comparisonTotalFailedTroubleshootingReports,
        icon: XCircle,
        tone: "slate",
      },
    ],
    [
      comparisonMetrics,
      comparisonStaleOpenTickets,
      comparisonTechnicianCheckIns,
      comparisonTechnicianCheckOuts,
      comparisonTotalFailedTroubleshootingReports,
      comparisonTotalQrScans,
      comparisonTotalSystemSolvedIssues,
      comparisonTotalTroubleshootingAttempts,
      currentlyCheckedIn,
      metrics?.kpis.total_tickets,
      metrics?.kpis.unassigned_tickets,
      staleOpenTickets,
      technicianActivityEvents,
      technicianCheckIns,
      technicianCheckOuts,
      totalFailedTroubleshootingReports,
      totalQrScans,
      totalSystemSolvedIssues,
      totalTroubleshootingAttempts,
    ]
  )

  const technicianWorkloadChartHeight = Math.max(320, technicianBreakdown.length * 56)
  const technicianTimeChartHeight = Math.max(320, technicianActivitySummary.length * 56)

  const technicianTimeData = useMemo(
    () =>
      technicianActivitySummary.map((item) => ({
        name: item.name,
        session_hours: item.total_session_hours,
        ticket_work_hours: item.total_ticket_work_hours,
      })),
    [technicianActivitySummary]
  )

  const handleRangeSelect = (range: PerformanceRange) => {
    setSelectedRange(range)
    if (range !== "custom") {
      void loadMetrics(range)
    }
  }

  const applyCustomRange = () => {
    if (!customStart || !customEnd) {
      setError("Pick both start and end date for custom filtering.")
      return
    }
    if (customStart > customEnd) {
      setError("Custom start date cannot be after end date.")
      return
    }
    void loadMetrics("custom", customStart, customEnd)
  }

  if (loading && !metrics) {
    return <p className="text-sm text-slate-500">Loading performance analytics...</p>
  }

  if (!metrics) {
    return <p className="text-sm text-rose-600">{error || "Performance metrics unavailable."}</p>
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="space-y-4 px-6 py-5">
          <div className="flex flex-wrap items-center justify-start gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline" className="border-slate-200 bg-white text-slate-700">
                  <Filter className="h-4 w-4" />
                  Filter: {rangeLabel(selectedRange)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
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
              <Button type="button" onClick={applyCustomRange} className="bg-[#0B1F3A] text-white hover:bg-[#17365A]">
                Apply
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-1 px-6 pb-6">
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {loading ? (
            <p className="inline-flex items-center gap-2 text-xs text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" />
              Refreshing metrics...
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((item) => (
          <KpiCard key={item.label} item={item} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Most Common Asset Problems</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {(troubleshootingAnalytics?.most_common_asset_problems ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No guided troubleshooting outcomes recorded in this range.</p>
            ) : (
              <div className="space-y-2">
                {(troubleshootingAnalytics?.most_common_asset_problems ?? []).map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <span className="font-medium text-slate-700">{item.name}</span>
                    <span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Repeated Failed Troubleshooting</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {(troubleshootingAnalytics?.assets_with_repeated_failed_troubleshooting ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No assets have repeated failed troubleshooting in this range.</p>
            ) : (
              <div className="space-y-2">
                {(troubleshootingAnalytics?.assets_with_repeated_failed_troubleshooting ?? []).map((item) => (
                  <div key={item.asset_code} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-800">{item.asset_code}</span>
                      <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">{item.count}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.asset_name}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Tickets By Priority</CardTitle>
            <ChartActions
              title="priority_chart"
              csvRows={(metrics.by_priority ?? []).map((item) => ({ label: item.name, count: item.count }))}
              containerRef={priorityChartRef}
            />
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <div ref={priorityChartRef} className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.by_priority}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[8, 8, 0, 0]}>
                    <LabelList dataKey="count" position="top" fill="#0F172A" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Tickets By Status</CardTitle>
            <ChartActions
              title="status_chart"
              csvRows={(metrics.by_status ?? []).map((item) => ({ label: item.name, count: item.count }))}
              containerRef={statusChartRef}
            />
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <div ref={statusChartRef} className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={metrics.by_status} dataKey="count" nameKey="name" outerRadius={110} label={pieLabelRenderer} labelLine>
                    {metrics.by_status.map((item, index) => (
                      <Cell key={item.name} fill={chartPalette[index % chartPalette.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Technician Workload</CardTitle>
            <ChartActions
              title="technician_workload_chart"
              csvRows={technicianBreakdown.map((item) => ({
                technician: item.name,
                assigned: item.assigned,
                solved: item.solved,
                pending: item.pending,
                escalated: item.escalated,
              }))}
              containerRef={workloadChartRef}
            />
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <div ref={workloadChartRef} className="w-full" style={{ height: technicianWorkloadChartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={technicianBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={180} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="assigned" stackId="workflow" fill="#2563eb" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="solved" stackId="workflow" fill="#16a34a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pending" stackId="workflow" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="escalated" stackId="workflow" fill="#dc2626" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Technician Time Tracking</CardTitle>
            <ChartActions
              title="technician_time_tracking_chart"
              csvRows={technicianTimeData.map((item) => ({
                technician: item.name,
                session_hours: item.session_hours,
                ticket_work_hours: item.ticket_work_hours,
              }))}
              containerRef={technicianTimeChartRef}
            />
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <div ref={technicianTimeChartRef} className="w-full" style={{ height: technicianTimeChartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={technicianTimeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={180} />
                  <Tooltip formatter={(value) => formatHours(Number(value ?? 0))} />
                  <Legend />
                  <Bar dataKey="session_hours" fill="#0ea5e9" name="Checked-In Hours" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="ticket_work_hours" fill="#22c55e" name="Ticket Work Hours" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">Technician Activity Summary</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-6 pb-6">
          {technicianActivitySummary.length === 0 ? (
            <p className="text-sm text-slate-500">No technician activity recorded in this range yet.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-3 py-3">Technician</th>
                  <th className="px-3 py-3">Check In</th>
                  <th className="px-3 py-3">Check Out</th>
                  <th className="px-3 py-3">Accepted</th>
                  <th className="px-3 py-3">Solved</th>
                  <th className="px-3 py-3">Escalated</th>
                  <th className="px-3 py-3">Asset Requests</th>
                  <th className="px-3 py-3">Checked-In Hours</th>
                  <th className="px-3 py-3">Work Hours</th>
                  <th className="px-3 py-3">Avg Work</th>
                  <th className="px-3 py-3">Current Status</th>
                </tr>
              </thead>
              <tbody>
                {technicianActivitySummary.map((item: TechnicianActivitySummaryDatum) => (
                  <tr key={item.technician_id} className="border-b border-slate-100 text-slate-700">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.skillset}</p>
                    </td>
                    <td className="px-3 py-3">{item.check_ins}</td>
                    <td className="px-3 py-3">{item.check_outs}</td>
                    <td className="px-3 py-3">{item.tickets_accepted}</td>
                    <td className="px-3 py-3">{item.tickets_solved}</td>
                    <td className="px-3 py-3">{item.tickets_escalated}</td>
                    <td className="px-3 py-3">{item.asset_requests_submitted}</td>
                    <td className="px-3 py-3">{formatHours(item.total_session_hours)}</td>
                    <td className="px-3 py-3">{formatHours(item.total_ticket_work_hours)}</td>
                    <td className="px-3 py-3">{formatHours(item.avg_ticket_work_hours)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={
                          item.is_currently_available
                            ? "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
                            : "rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
                        }
                      >
                        {item.is_currently_available ? "Checked In" : "Checked Out"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">Recent Technician Activity</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-6 pb-6">
          {technicianRecentActivity.length === 0 ? (
            <p className="text-sm text-slate-500">No recent technician activity recorded in this range.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-3 py-3">When</th>
                  <th className="px-3 py-3">Technician</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Details</th>
                  <th className="px-3 py-3">Duration</th>
                </tr>
              </thead>
              <tbody>
                {technicianRecentActivity.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 text-slate-700">
                    <td className="px-3 py-3">{formatDateTime(item.occurred_at)}</td>
                    <td className="px-3 py-3">{item.technician_name}</td>
                    <td className="px-3 py-3">{item.action_label}</td>
                    <td className="px-3 py-3">
                      <p>{item.description || "No description recorded."}</p>
                      {item.ticket_id ? <p className="text-xs text-slate-500">Ticket #{item.ticket_id}</p> : null}
                      {item.consumable_request_id ? (
                        <p className="text-xs text-slate-500">Asset Request #{item.consumable_request_id}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">{formatDurationMinutes(item.duration_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
