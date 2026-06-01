"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Clock3,
  Download,
  FileImage,
  Filter,
  Flag,
  LogIn,
  LogOut,
  PieChart as PieChartIcon,
  QrCode,
  TrendingUp,
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

const priorityPalette = ["#ff5157", "#18c8a0", "#0ea5ff", "#f59e0b", "#a855f7", "#22c55e"]
const statusPalette = ["#ff8a21", "#0867ff", "#13b87a", "#f43f5e", "#8b5cf6", "#14b8a6", "#facc15"]

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
type WorkloadSegmentKey = "assigned" | "escalated" | "pending" | "solved"

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

const workloadSegmentStyles: Record<WorkloadSegmentKey, { label: string; color: string }> = {
  assigned: { label: "Assigned", color: "#2563EB" },
  escalated: { label: "Escalated", color: "#DC2626" },
  pending: { label: "Pending", color: "#F59E0B" },
  solved: { label: "Solved", color: "#16A34A" },
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
  variant = "light",
}: {
  title: string
  csvRows: CsvRow[]
  containerRef: RefObject<HTMLDivElement | null>
  variant?: "light" | "dark"
}) {
  const isDark = variant === "dark"
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(
          "h-9 gap-1.5 rounded-md px-3 text-xs font-semibold",
          isDark
            ? "border-[#2B4775] bg-[#102549] text-[#EAF3FF] hover:bg-[#18335F] hover:text-white"
            : "border-slate-200"
        )}
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
        className={cn(
          "h-9 gap-1.5 rounded-md px-3 text-xs font-semibold",
          isDark
            ? "border-[#2B4775] bg-[#102549] text-[#EAF3FF] hover:bg-[#18335F] hover:text-white"
            : "border-slate-200"
        )}
        onClick={() => void downloadChartAsPng(`${title.toLowerCase().replace(/\s+/g, "_")}.png`, containerRef.current)}
      >
        <FileImage className="h-4 w-4" />
        PNG
      </Button>
    </div>
  )
}

function rangeLabel(value: PerformanceRange): string {
  return quickRanges.find((item) => item.value === value)?.label ?? "Monthly"
}

function statusDonutLabelRenderer({
  name,
  value,
  percent,
  x,
  y,
  textAnchor,
}: {
  name?: string
  value?: number
  percent?: number
  x?: number | string
  y?: number | string
  textAnchor?: string
}) {
  if (typeof x === "undefined" || typeof y === "undefined") {
    return null
  }

  const normalizedPercent = typeof percent === "number" ? Math.round(percent * 1000) / 10 : 0
  const labelAnchor =
    textAnchor === "start" || textAnchor === "middle" || textAnchor === "end" || textAnchor === "inherit"
      ? textAnchor
      : "middle"

  return (
    <text x={x} y={y} textAnchor={labelAnchor} dominantBaseline="central" fill="#C7DAF5" fontSize={12}>
      {name ?? "Status"} {value ?? 0} ({normalizedPercent}%)
    </text>
  )
}

function getPriorityColor(name: string, index: number): string {
  const normalized = name.toLowerCase()
  if (normalized.includes("high") || normalized.includes("critical")) {
    return "#ff5157"
  }
  if (normalized.includes("medium")) {
    return "#0ea5ff"
  }
  if (normalized.includes("low")) {
    return "#18c8a0"
  }
  return priorityPalette[index % priorityPalette.length]
}

function getStatusColor(name: string, index: number): string {
  const normalized = name.toLowerCase()
  if (normalized.includes("progress") || normalized.includes("process")) {
    return "#0867ff"
  }
  if (normalized.includes("review")) {
    return "#13b87a"
  }
  if (normalized.includes("pending")) {
    return "#ff8a21"
  }
  if (normalized.includes("solved") || normalized.includes("resolved")) {
    return "#22c55e"
  }
  return statusPalette[index % statusPalette.length]
}

function formatCount(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US").format(value ?? 0)
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) {
    return "T"
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function downloadTechnicianActivityPng(filename: string, rows: TechnicianActivitySummaryDatum[]) {
  const width = 1600
  const rowHeight = 82
  const headerHeight = 120
  const footerHeight = 36
  const height = headerHeight + Math.max(rows.length, 1) * rowHeight + footerHeight
  const canvas = document.createElement("canvas")
  canvas.width = width * 2
  canvas.height = height * 2
  const context = canvas.getContext("2d")
  if (!context) {
    return
  }

  context.scale(2, 2)
  context.fillStyle = "#FFFFFF"
  context.fillRect(0, 0, width, height)
  context.fillStyle = "#071A38"
  context.font = "700 30px Arial"
  context.fillText("Technician Activity Summary", 42, 54)
  context.fillStyle = "#466187"
  context.font = "400 17px Arial"
  context.fillText("Overview of technician performance and activity metrics", 42, 84)

  const columns = [
    ["Technician", 42],
    ["Check In", 300],
    ["Check Out", 430],
    ["Accepted", 570],
    ["Solved", 710],
    ["Escalated", 850],
    ["Asset Requests", 995],
    ["Checked-In Hours", 1165],
    ["Work Hours", 1320],
    ["Avg Work", 1450],
  ] as const

  context.fillStyle = "#F8FBFF"
  context.fillRect(24, 110, width - 48, 44)
  context.fillStyle = "#365173"
  context.font = "700 13px Arial"
  columns.forEach(([label, x]) => context.fillText(label, x, 138))

  rows.forEach((item, index) => {
    const y = 154 + index * rowHeight
    context.strokeStyle = "#E2EAF5"
    context.beginPath()
    context.moveTo(24, y)
    context.lineTo(width - 24, y)
    context.stroke()

    context.fillStyle = "#EEF5FF"
    context.beginPath()
    context.arc(62, y + 40, 24, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = "#2563EB"
    context.font = "700 17px Arial"
    context.fillText(getInitials(item.name), 50, y + 46)

    context.fillStyle = "#071A38"
    context.font = "700 15px Arial"
    context.fillText(item.name, 100, y + 34)
    context.fillStyle = "#557094"
    context.font = "400 13px Arial"
    context.fillText(item.skillset, 100, y + 55)

    const values = [
      item.check_ins,
      item.check_outs,
      item.tickets_accepted,
      item.tickets_solved,
      item.tickets_escalated,
      item.asset_requests_submitted,
      formatHours(item.total_session_hours),
      formatHours(item.total_ticket_work_hours),
      formatHours(item.avg_ticket_work_hours),
    ]
    const valueXs = [315, 445, 595, 735, 875, 1035, 1200, 1350, 1480]
    values.forEach((value, valueIndex) => {
      context.fillStyle = valueIndex < 2 ? "#0B63F6" : valueIndex < 4 ? "#00A85A" : valueIndex === 4 ? "#DC2626" : valueIndex === 5 ? "#6D28D9" : "#071A38"
      context.font = "500 16px Arial"
      context.fillText(String(value), valueXs[valueIndex], y + 46)
    })
  })

  const link = document.createElement("a")
  link.href = canvas.toDataURL("image/png")
  link.download = filename
  link.click()
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
  const [activityPage, setActivityPage] = useState(1)

  const priorityChartRef = useRef<HTMLDivElement>(null)
  const statusChartRef = useRef<HTMLDivElement>(null)
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
  const activityPageSize = 4
  const activityTotalPages = Math.max(1, Math.ceil(technicianActivitySummary.length / activityPageSize))
  const activityStartIndex = technicianActivitySummary.length > 0 ? (activityPage - 1) * activityPageSize : 0
  const visibleTechnicianActivitySummary = technicianActivitySummary.slice(
    activityStartIndex,
    activityStartIndex + activityPageSize
  )
  const activityDisplayStart = technicianActivitySummary.length > 0 ? activityStartIndex + 1 : 0
  const activityDisplayEnd = Math.min(activityStartIndex + activityPageSize, technicianActivitySummary.length)
  const technicianActivityCsvRows = technicianActivitySummary.map((item) => ({
    technician: item.name,
    skillset: item.skillset,
    check_ins: item.check_ins,
    check_outs: item.check_outs,
    accepted: item.tickets_accepted,
    solved: item.tickets_solved,
    escalated: item.tickets_escalated,
    asset_requests: item.asset_requests_submitted,
    checked_in_hours: item.total_session_hours,
    work_hours: item.total_ticket_work_hours,
    avg_work_hours: item.avg_ticket_work_hours,
    current_status: item.is_currently_available ? "Checked In" : "Checked Out",
  }))

  useEffect(() => {
    setActivityPage((currentPage) => Math.min(currentPage, activityTotalPages))
  }, [activityTotalPages])

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
  const technicianWorkloadRows = useMemo(
    () =>
      technicianBreakdown.map((item) => {
        const totalTickets = Math.max(item.assigned, item.solved + item.pending + item.escalated)
        const activeAssigned = Math.max(totalTickets - item.solved - item.pending - item.escalated, 0)

        return {
          name: item.name,
          initials: getInitials(item.name),
          totalTickets,
          segments: [
            { key: "assigned" as const, value: activeAssigned },
            { key: "escalated" as const, value: item.escalated },
            { key: "pending" as const, value: item.pending },
            { key: "solved" as const, value: item.solved },
          ].filter((segment) => segment.value > 0),
        }
      }),
    [technicianBreakdown]
  )
  const workloadRawMax = Math.max(4, ...technicianWorkloadRows.map((item) => item.totalTickets))
  const workloadTickStep = workloadRawMax <= 6 ? 1 : Math.ceil(workloadRawMax / 4)
  const workloadAxisMax = workloadRawMax <= 6 ? workloadRawMax : workloadTickStep * 4
  const workloadTicks = Array.from(
    { length: Math.floor(workloadAxisMax / workloadTickStep) + 1 },
    (_, index) => index * workloadTickStep
  )
  const priorityChartData = useMemo(
    () =>
      (metrics?.by_priority ?? []).map((item, index) => ({
        ...item,
        fill: getPriorityColor(item.name, index),
      })),
    [metrics]
  )
  const statusChartData = useMemo(
    () =>
      (metrics?.by_status ?? []).map((item, index) => ({
        ...item,
        fill: getStatusColor(item.name, index),
      })),
    [metrics]
  )
  const priorityTicketTotal = priorityChartData.reduce((total, item) => total + item.count, 0)
  const statusTicketTotal = statusChartData.reduce((total, item) => total + item.count, 0)
  const pendingTicketTotal = statusChartData
    .filter((item) => item.name.toLowerCase().includes("pending"))
    .reduce((total, item) => total + item.count, 0)
  const pendingTicketPercent = statusTicketTotal > 0 ? Math.round((pendingTicketTotal / statusTicketTotal) * 100) : 0
  const priorityTrendPercent = calculateTrendPercent(priorityTicketTotal, comparisonMetrics?.kpis.total_tickets)
  const PriorityTrendIcon = priorityTrendPercent < 0 ? ArrowDown : ArrowUp

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
        <Card className="overflow-hidden rounded-xl border-[#385582] bg-[radial-gradient(circle_at_14%_10%,rgba(37,99,235,0.32),transparent_31%),linear-gradient(135deg,#071326_0%,#0B1E3B_56%,#071224_100%)] py-0 text-white shadow-[0_24px_60px_-34px_rgba(4,18,40,0.9)]">
          <CardHeader className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#1D53D8]/55 bg-gradient-to-br from-[#164CFF] to-[#102E86] shadow-[0_0_28px_rgba(37,99,235,0.35)]">
                <BarChart3 className="h-5 w-5 text-[#73B7FF]" />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold text-[#F5F9FF]">Tickets By Priority</CardTitle>
                <p className="mt-1 text-xs text-[#8EA7CC]">Distribution of tickets by priority level</p>
              </div>
            </div>
            <ChartActions
              title="priority_chart"
              csvRows={priorityChartData.map((item) => ({ label: item.name, count: item.count }))}
              containerRef={priorityChartRef}
              variant="dark"
            />
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-5">
            <div ref={priorityChartRef} className="h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityChartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C3358" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: "#2E4B74" }} tick={{ fill: "#C6D6ED", fontSize: 12 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={{ stroke: "#2E4B74" }} tick={{ fill: "#C6D6ED", fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: "rgba(96,165,250,0.08)" }}
                    contentStyle={{
                      background: "#0B1D38",
                      border: "1px solid #36588A",
                      borderRadius: 8,
                      color: "#EAF3FF",
                    }}
                    labelStyle={{ color: "#FFFFFF" }}
                  />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    <LabelList dataKey="count" position="top" fill="#F8FBFF" fontSize={12} />
                    {priorityChartData.map((item) => (
                      <Cell key={item.name} fill={item.fill} stroke={item.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[#1D355C] bg-[#10254A]/72 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#173B86] text-[#83BDFF]">
                  <BarChart3 className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xl font-bold leading-6 text-white">{formatCount(priorityTicketTotal)}</p>
                  <p className="text-xs text-[#9EB3D3]">Total Tickets</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-[#123E3A] px-3 py-2 text-xs font-semibold text-[#55E6AE]">
                <PriorityTrendIcon className="h-3.5 w-3.5" />
                {Math.abs(priorityTrendPercent)}% vs last week
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-xl border-[#385582] bg-[radial-gradient(circle_at_22%_12%,rgba(91,33,182,0.36),transparent_30%),linear-gradient(135deg,#071326_0%,#0B1E3B_56%,#071224_100%)] py-0 text-white shadow-[0_24px_60px_-34px_rgba(4,18,40,0.9)]">
          <CardHeader className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#6947FF]/55 bg-gradient-to-br from-[#5B45FF] to-[#321E91] shadow-[0_0_28px_rgba(99,102,241,0.35)]">
                <PieChartIcon className="h-5 w-5 text-[#A7A3FF]" />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold text-[#F5F9FF]">Tickets By Status</CardTitle>
                <p className="mt-1 text-xs text-[#8EA7CC]">Current status distribution</p>
              </div>
            </div>
            <ChartActions
              title="status_chart"
              csvRows={statusChartData.map((item) => ({ label: item.name, count: item.count }))}
              containerRef={statusChartRef}
              variant="dark"
            />
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-5">
            <div ref={statusChartRef} className="h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={68}
                    outerRadius={115}
                    paddingAngle={1}
                    label={statusDonutLabelRenderer}
                    labelLine={{ stroke: "#4C6D9B" }}
                  >
                    {statusChartData.map((item) => (
                      <Cell key={item.name} fill={item.fill} stroke="#0B1D38" strokeWidth={2} />
                    ))}
                  </Pie>
                  <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" fill="#FFFFFF" fontSize={30} fontWeight={700}>
                    {formatCount(statusTicketTotal)}
                  </text>
                  <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle" fill="#C6D6ED" fontSize={12}>
                    Total Tickets
                  </text>
                  <Tooltip
                    contentStyle={{
                      background: "#0B1D38",
                      border: "1px solid #36588A",
                      borderRadius: 8,
                      color: "#EAF3FF",
                    }}
                    labelStyle={{ color: "#FFFFFF" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[#1D355C] bg-[#10254A]/72 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3B2714] text-[#FF9E2C]">
                  <PieChartIcon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xl font-bold leading-6 text-white">{pendingTicketPercent}%</p>
                  <p className="text-xs text-[#9EB3D3]">Pending Tickets</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-2 rounded-md bg-[#162947] px-3 py-2 text-xs font-medium text-[#D7E8FF]">
                <span className="h-2 w-2 rounded-full bg-[#FFB22A]" />
                Needs attention
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-xl border-[#E1E8F2] bg-white py-0 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.55)] xl:col-span-2">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]">
              <div className="border-b border-[#E8EEF6] bg-[#FBFDFF] md:border-r md:border-b-0">
                <div className="flex h-12 items-center px-5 text-xs font-bold text-[#1D3F66]">Technician</div>
                <div>
                  {technicianWorkloadRows.map((item) => (
                    <div key={item.name} className="flex h-[72px] items-center gap-3 px-5">
                      <div className="relative shrink-0">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F1FF] text-sm font-bold text-[#2563EB]">
                          {item.initials}
                        </span>
                        <span className="absolute -right-0.5 bottom-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#16A34A]" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-[#1B3557]">{item.name}</p>
                        <p className="mt-1 flex items-center gap-2 text-[11px] text-[#6B84A6]">
                          <span>Total Tickets</span>
                          <span className="font-bold text-[#2563EB]">{formatCount(item.totalTickets)}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="min-w-0 bg-white">
                <div className="flex h-12 items-center px-4 text-xs font-bold text-[#1D3F66]">Tickets</div>
                <div className="relative px-4 pb-4">
                  <div className="pointer-events-none absolute top-0 right-4 bottom-10 left-4">
                    {workloadTicks.map((tick) => (
                      <span
                        key={tick}
                        className="absolute top-0 bottom-0 border-l border-dashed border-[#DDE6F1]"
                        style={{ left: `${(tick / workloadAxisMax) * 100}%` }}
                      />
                    ))}
                  </div>

                  <div className="relative">
                    {technicianWorkloadRows.map((item) => (
                      <div key={item.name} className="flex h-[72px] items-center">
                        <div className="flex h-9 w-full overflow-hidden rounded-[3px]">
                          {item.segments.length === 0 ? (
                            <span className="h-full w-px bg-[#CAD7E8]" />
                          ) : (
                            item.segments.map((segment, index) => {
                              const segmentStyle = workloadSegmentStyles[segment.key]
                              const isFirst = index === 0
                              const isLast = index === item.segments.length - 1

                              return (
                                <span
                                  key={segment.key}
                                  className={cn(
                                    "flex h-full items-center justify-center text-xs font-bold text-white shadow-sm",
                                    isFirst && "rounded-l-[3px]",
                                    isLast && "rounded-r-[3px]"
                                  )}
                                  style={{
                                    width: `${Math.max((segment.value / workloadAxisMax) * 100, 2)}%`,
                                    backgroundColor: segmentStyle.color,
                                  }}
                                >
                                  {segment.value}
                                </span>
                              )
                            })
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="relative h-8 border-t border-[#B8C8DD]">
                    {workloadTicks.map((tick) => (
                      <span
                        key={tick}
                        className="absolute top-2 -translate-x-1/2 text-xs font-medium text-[#5D7290]"
                        style={{ left: `${(tick / workloadAxisMax) * 100}%` }}
                      >
                        {tick}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap justify-center gap-5 pt-4 text-xs font-medium text-[#1E3554]">
                    {(Object.keys(workloadSegmentStyles) as WorkloadSegmentKey[]).map((key) => (
                      <span key={key} className="inline-flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: workloadSegmentStyles[key].color }}
                        />
                        {workloadSegmentStyles[key].label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
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

      <Card className="overflow-hidden rounded-[22px] border-[#DDE8F6] bg-white py-0 shadow-[0_22px_55px_-40px_rgba(37,99,235,0.65)]">
        <CardHeader className="flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[#D9E7FF] bg-[#F7FBFF] text-[#2563EB] shadow-[0_12px_28px_-24px_rgba(37,99,235,0.8)]">
              <TrendingUp className="h-7 w-7" />
            </span>
            <div>
              <CardTitle className="text-2xl font-bold tracking-normal text-[#071A38]">Technician Activity Summary</CardTitle>
              <p className="mt-2 text-sm text-[#496487]">Overview of technician performance and activity metrics</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-lg border-[#DDE8F6] bg-white px-5 text-sm font-semibold text-[#071A38] shadow-sm hover:bg-[#F7FBFF]"
              disabled={technicianActivityCsvRows.length === 0}
              onClick={() => downloadCsv("technician_activity_summary.csv", technicianActivityCsvRows)}
            >
              <Download className="h-5 w-5 text-[#2D5485]" />
              CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-lg border-[#DDE8F6] bg-white px-5 text-sm font-semibold text-[#071A38] shadow-sm hover:bg-[#F7FBFF]"
              disabled={technicianActivitySummary.length === 0}
              onClick={() => downloadTechnicianActivityPng("technician_activity_summary.png", technicianActivitySummary)}
            >
              <FileImage className="h-5 w-5 text-[#2D5485]" />
              PNG
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          {technicianActivitySummary.length === 0 ? (
            <div className="rounded-2xl border border-[#DDE8F6] px-5 py-8 text-center text-sm text-[#496487]">
              No technician activity recorded in this range yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#DDE8F6] bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-[1260px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#DDE8F6] bg-[#FBFDFF] text-center text-xs uppercase tracking-[0.04em] text-[#365173]">
                      <th className="w-[220px] px-5 py-5 text-left">
                        <div className="flex items-center gap-3">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D9E7FF] bg-[#F2F7FF] text-[#0B63F6]">
                            <UserRound className="h-5 w-5" />
                          </span>
                          <span>Technician</span>
                        </div>
                      </th>
                      <th className="px-4 py-5">
                        <div className="flex flex-col items-center gap-2">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D9E7FF] bg-[#F2F7FF] text-[#0B63F6]">
                            <LogIn className="h-5 w-5" />
                          </span>
                          <span>Check In</span>
                        </div>
                      </th>
                      <th className="px-4 py-5">
                        <div className="flex flex-col items-center gap-2">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D9E7FF] bg-[#F2F7FF] text-[#0B63F6]">
                            <LogOut className="h-5 w-5" />
                          </span>
                          <span>Check Out</span>
                        </div>
                      </th>
                      <th className="px-4 py-5">
                        <div className="flex flex-col items-center gap-2">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#CBEFDD] bg-[#EFFFF6] text-[#00A85A]">
                            <CheckCircle2 className="h-5 w-5" />
                          </span>
                          <span>Accepted</span>
                        </div>
                      </th>
                      <th className="px-4 py-5">
                        <div className="flex flex-col items-center gap-2">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#CBEFDD] bg-[#EFFFF6] text-[#00A85A]">
                            <CheckCircle2 className="h-5 w-5" />
                          </span>
                          <span>Solved</span>
                        </div>
                      </th>
                      <th className="px-4 py-5">
                        <div className="flex flex-col items-center gap-2">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#FBD1D1] bg-[#FFF1F1] text-[#DC2626]">
                            <ArrowUp className="h-5 w-5" />
                          </span>
                          <span>Escalated</span>
                        </div>
                      </th>
                      <th className="px-4 py-5">
                        <div className="flex flex-col items-center gap-2">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#DDD2FF] bg-[#F6F1FF] text-[#6D28D9]">
                            <ClipboardList className="h-5 w-5" />
                          </span>
                          <span>Asset Requests</span>
                        </div>
                      </th>
                      <th className="px-4 py-5">
                        <div className="flex flex-col items-center gap-2">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D9E7FF] bg-[#F2F7FF] text-[#0B63F6]">
                            <Clock3 className="h-5 w-5" />
                          </span>
                          <span>Checked-In Hours</span>
                        </div>
                      </th>
                      <th className="px-4 py-5">
                        <div className="flex flex-col items-center gap-2">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D9E7FF] bg-[#F2F7FF] text-[#0B63F6]">
                            <Wrench className="h-5 w-5" />
                          </span>
                          <span>Work Hours</span>
                        </div>
                      </th>
                      <th className="px-4 py-5">
                        <div className="flex flex-col items-center gap-2">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D9E7FF] bg-[#F2F7FF] text-[#0B63F6]">
                            <TrendingUp className="h-5 w-5" />
                          </span>
                          <span>Avg Work</span>
                        </div>
                      </th>
                      <th className="px-4 py-5">
                        <div className="flex flex-col items-center gap-2">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D9E7FF] bg-[#F2F7FF] text-[#0B63F6]">
                            <Flag className="h-5 w-5" />
                          </span>
                          <span>Current Status</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTechnicianActivitySummary.map((item: TechnicianActivitySummaryDatum) => (
                      <tr key={item.technician_id} className="border-b border-[#E6EEF8] text-center last:border-b-0">
                        <td className="px-5 py-6 text-left">
                          <div className="flex items-center gap-4">
                            <div className="relative shrink-0">
                              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EDF5FF] text-lg font-bold text-[#2563EB]">
                                {getInitials(item.name)}
                              </span>
                              <span
                                className={cn(
                                  "absolute -right-0.5 bottom-2 h-3 w-3 rounded-full border-2 border-white",
                                  item.is_currently_available ? "bg-[#16A34A]" : "bg-[#94A3B8]"
                                )}
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold leading-6 text-[#071A38]">{item.name}</p>
                              <p className="text-sm text-[#5B7192]">{item.skillset}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-6 text-lg font-medium text-[#0B63F6]">{item.check_ins}</td>
                        <td className="px-4 py-6 text-lg font-medium text-[#0B63F6]">{item.check_outs}</td>
                        <td className="px-4 py-6 text-lg font-medium text-[#00A85A]">{item.tickets_accepted}</td>
                        <td className="px-4 py-6 text-lg font-medium text-[#00A85A]">{item.tickets_solved}</td>
                        <td className="px-4 py-6 text-lg font-medium text-[#DC2626]">{item.tickets_escalated}</td>
                        <td className="px-4 py-6 text-lg font-medium text-[#6D28D9]">{item.asset_requests_submitted}</td>
                        <td className="px-4 py-6 text-lg font-medium text-[#071A38]">{formatHours(item.total_session_hours)}</td>
                        <td className="px-4 py-6 text-lg font-medium text-[#071A38]">{formatHours(item.total_ticket_work_hours)}</td>
                        <td className="px-4 py-6 text-lg font-medium text-[#071A38]">{formatHours(item.avg_ticket_work_hours)}</td>
                        <td className="px-4 py-6">
                          <span
                            className={cn(
                              "inline-flex min-w-[108px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
                              item.is_currently_available
                                ? "bg-[#EFFFF6] text-[#047847]"
                                : "bg-[#FFF4E3] text-[#9A4C00]"
                            )}
                          >
                            <span
                              className={cn(
                                "h-2.5 w-2.5 rounded-full",
                                item.is_currently_available ? "bg-[#16A34A]" : "bg-[#F59E0B]"
                              )}
                            />
                            {item.is_currently_available ? "Checked In" : "Checked Out"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-[#DDE8F6] px-5 py-4 text-sm text-[#496487] sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Showing {activityDisplayStart} to {activityDisplayEnd} of {technicianActivitySummary.length} technicians
                </span>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={activityPage <= 1}
                    onClick={() => setActivityPage((current) => Math.max(1, current - 1))}
                    className="h-10 w-10 rounded-lg border-[#DDE8F6] bg-white text-[#6B84A6] disabled:opacity-45"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <span className="flex h-10 min-w-10 items-center justify-center rounded-lg bg-[#2563EB] px-3 text-sm font-bold text-white shadow-sm">
                    {activityPage}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={activityPage >= activityTotalPages}
                    onClick={() => setActivityPage((current) => Math.min(activityTotalPages, current + 1))}
                    className="h-10 w-10 rounded-lg border-[#DDE8F6] bg-white text-[#6B84A6] disabled:opacity-45"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
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
