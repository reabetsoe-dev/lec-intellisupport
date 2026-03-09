"use client"

import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { Download } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getPerformanceMetrics, type CountDatum, type PerformanceMetrics } from "@/lib/api"

const chartPalette = ["#0ea5e9", "#f97316", "#22c55e", "#e11d48", "#a855f7", "#14b8a6", "#facc15"]

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
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
  data,
  containerRef,
}: {
  title: string
  data: CountDatum[]
  containerRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-slate-200"
        onClick={() =>
          downloadCsv(
            `${title.toLowerCase().replace(/\s+/g, "_")}.csv`,
            data.map((item) => ({ label: item.name, count: item.count }))
          )
        }
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

export function PerformanceAnalyticsPanel() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const statusChartRef = useRef<HTMLDivElement>(null)
  const priorityChartRef = useRef<HTMLDivElement>(null)
  const trendChartRef = useRef<HTMLDivElement>(null)
  const technicianChartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const run = async () => {
      try {
        const payload = await getPerformanceMetrics()
        setMetrics(payload)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load KPI data.")
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  const technicianTop = useMemo(
    () => (metrics?.by_technician ?? []).slice().sort((a, b) => b.count - a.count).slice(0, 8),
    [metrics]
  )

  if (loading) {
    return <p className="text-sm text-slate-500">Loading performance analytics...</p>
  }

  if (error || !metrics) {
    return <p className="text-sm text-rose-600">{error || "Performance metrics unavailable."}</p>
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-slate-600">Total Tickets</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-slate-900">{metrics.kpis.total_tickets}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-slate-600">Resolved Rate</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-slate-900">{metrics.kpis.resolved_rate}%</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-sm text-slate-600">Unassigned Tickets</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-3xl font-semibold text-slate-900">{metrics.kpis.unassigned_tickets}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Tickets By Priority</CardTitle>
            <ChartActions title="priority_chart" data={metrics.by_priority} containerRef={priorityChartRef} />
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <div ref={priorityChartRef} className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.by_priority}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Tickets By Status</CardTitle>
            <ChartActions title="status_chart" data={metrics.by_status} containerRef={statusChartRef} />
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <div ref={statusChartRef} className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={metrics.by_status} dataKey="count" nameKey="name" outerRadius={110} label>
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

        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Monthly Ticket Trend</CardTitle>
            <ChartActions title="monthly_trend_chart" data={metrics.by_month} containerRef={trendChartRef} />
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <div ref={trendChartRef} className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.by_month}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Technician Workload</CardTitle>
            <ChartActions title="technician_workload_chart" data={technicianTop} containerRef={technicianChartRef} />
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <div ref={technicianChartRef} className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={technicianTop} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={120} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#14b8a6" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
