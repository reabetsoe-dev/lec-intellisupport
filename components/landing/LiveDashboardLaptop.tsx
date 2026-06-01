"use client"

import type { CSSProperties } from "react"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"

type DashboardRow = {
  place: string
  time: string
}

type DashboardSnapshot = {
  active: number
  critical: number
  resolved: number
  sla: number
  bars: number[]
  criticalRows: DashboardRow[]
  responseRows: DashboardRow[]
}

const dashboardPills = [
  { label: "Ticket", value: "Live Queue" },
  { label: "SLA", value: "Compliance" },
  { label: "Support", value: "Dispatch" },
  { label: "Insights", value: "Forecast" },
] as const

const barTones = [
  "bg-[#1e5bd6]",
  "bg-[#2d7ef6]",
  "bg-[#ff2d45]",
  "bg-[#306deb]",
  "bg-[#1859d4]",
  "bg-[#ff334b]",
  "bg-[#3f63c8]",
  "bg-[#4a8cff]",
] as const

const snapshots: DashboardSnapshot[] = [
  {
    active: 482,
    critical: 129,
    resolved: 341,
    sla: 93,
    bars: [31, 40, 53, 72, 46, 61, 49, 41],
    criticalRows: [
      { place: "Mafeteng - CBD", time: "10:20" },
      { place: "Berea - Tayotayeng", time: "10:00" },
      { place: "Maseru - Ho Thestane", time: "10:10" },
    ],
    responseRows: [
      { place: "Mafeteng - CBD", time: "9:13 AM" },
      { place: "Berea - Tayotayeng", time: "9:23 AM" },
      { place: "Maseru - Ho Thestane", time: "9:29 PM" },
    ],
  },
  {
    active: 469,
    critical: 117,
    resolved: 356,
    sla: 95,
    bars: [36, 45, 48, 65, 51, 57, 44, 46],
    criticalRows: [
      { place: "Qacha's Nek - Mainline", time: "10:42" },
      { place: "Mafeteng - Industrial", time: "10:18" },
      { place: "Maseru - South", time: "9:54" },
    ],
    responseRows: [
      { place: "Butha-Buthe - North", time: "9:38 AM" },
      { place: "Mohale's Hoek - CBD", time: "9:47 AM" },
      { place: "Leribe - Hlotse", time: "9:51 AM" },
    ],
  },
  {
    active: 495,
    critical: 134,
    resolved: 332,
    sla: 92,
    bars: [29, 37, 56, 69, 54, 63, 47, 39],
    criticalRows: [
      { place: "Mokhotlong - Ridge", time: "11:08" },
      { place: "Berea - Ha Foso", time: "10:57" },
      { place: "Maseru - Stadium", time: "10:43" },
    ],
    responseRows: [
      { place: "Quthing - River", time: "10:06 AM" },
      { place: "Leribe - Main", time: "10:11 AM" },
      { place: "Thaba-Tseka - Hub", time: "10:20 AM" },
    ],
  },
]

export default function LiveDashboardLaptop() {
  const [snapshotIndex, setSnapshotIndex] = useState(0)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSnapshotIndex((current) => (current + 1) % snapshots.length)
    }, 3200)

    return () => window.clearInterval(intervalId)
  }, [])

  const snapshot = snapshots[snapshotIndex]

  const efficiencyRingStyle = useMemo<CSSProperties>(() => {
    const total = Math.max(snapshot.active + snapshot.critical + snapshot.resolved, 1)
    const criticalPercent = Math.round((snapshot.critical / total) * 100)
    const activePercent = Math.round((snapshot.active / total) * 100)
    const activeEnd = criticalPercent + activePercent

    return {
      background: `conic-gradient(#ff334b 0 ${criticalPercent}%, #2973f0 ${criticalPercent}% ${activeEnd}%, #9eb7ec ${activeEnd}% 100%)`,
      transition: "background 760ms ease",
    }
  }, [snapshot])

  return (
    <div className="lec-laptop-float relative mx-auto w-full max-w-[860px] pb-14 pt-5">
      <div className="lec-laptop-shell rounded-[30px] p-3 sm:p-4">
        <div className="lec-laptop-bezel overflow-hidden rounded-[24px] border border-[#304a88] bg-[#091237]">
          <div className="flex items-center justify-between gap-3 border-b border-white/7 bg-[linear-gradient(180deg,rgba(18,32,76,0.95)_0%,rgba(12,24,63,0.96)_100%)] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-3">
              <Image src="/lec-logo-current.jpg" alt="LEC logo" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
              <span className="text-sm font-medium text-white/94 sm:text-[15px]">LEC IntelliSupport</span>
            </div>
            <div className="hidden items-center gap-6 text-xs font-medium text-white/78 sm:flex">
              <span>Features</span>
              <span>Contact</span>
              <span className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-white/72">Search</span>
              <span className="lec-live-chip">
                <span className="lec-live-dot" />
                Live
              </span>
            </div>
          </div>

          <div className="space-y-4 bg-[radial-gradient(circle_at_12%_8%,rgba(72,109,196,0.32)_0%,rgba(72,109,196,0)_45%),linear-gradient(180deg,#111f52_0%,#0b1742_100%)] p-4 sm:p-5">
            <div className="grid gap-2.5 sm:grid-cols-4">
              {dashboardPills.map((pill) => (
                <div key={pill.label} className="lec-pulse-soft rounded-xl border border-white/9 bg-white/5 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/58">{pill.label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-white/92">{pill.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-[1.16fr_0.84fr]">
              <article className="lec-dashboard-card rounded-2xl border border-white/10 bg-[#101f53] px-4 pb-4 pt-3">
                <div className="flex items-center justify-between text-white/84">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.28em]">Live Fault Throughput</h2>
                  <span className="text-xs text-white/60">refresh 3.2s</span>
                </div>

                <div className="mt-3 grid h-40 grid-cols-8 items-end gap-2 rounded-xl border border-white/7 bg-[linear-gradient(180deg,#13275f_0%,#0b1843_100%)] px-3 pb-3 pt-5">
                  {snapshot.bars.map((height, index) => (
                    <div key={`bar-${index}`} className="flex h-full items-end">
                      <div
                        className={`w-full rounded-t-[8px] ${barTones[index]} transition-[height,filter] duration-700 ease-out`}
                        style={{ height: `${height}%`, filter: "drop-shadow(0 0 6px rgba(58,113,255,0.24))" }}
                      />
                    </div>
                  ))}
                </div>
              </article>

              <article className="lec-dashboard-card rounded-2xl border border-white/10 bg-[#101f53] px-4 pb-4 pt-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/84">Team Efficiency</h2>

                <div className="mt-3 flex items-center gap-4">
                  <div className="flex h-[6.5rem] w-[6.5rem] items-center justify-center rounded-full p-3 transition-all duration-700" style={efficiencyRingStyle}>
                    <div className="h-full w-full rounded-full bg-[#101f53]" />
                  </div>
                  <div className="space-y-2 text-white">
                    <div>
                      <p className="text-4xl font-semibold leading-none tabular-nums transition-all duration-500">{snapshot.active}</p>
                      <p className="text-[20px] text-white/78">Active</p>
                    </div>
                    <div>
                      <p className="text-4xl font-semibold leading-none tabular-nums transition-all duration-500">{snapshot.critical}</p>
                      <p className="text-[20px] text-white/78">Critical</p>
                    </div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#9eb8f8]">SLA {snapshot.sla}%</p>
                  </div>
                </div>
              </article>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <article className="lec-dashboard-card rounded-2xl border border-white/10 bg-[#0f1b49] p-3.5">
                <h3 className="text-sm font-semibold text-white">Critical Faults</h3>
                <ul className="mt-2.5 space-y-2.5">
                  {snapshot.criticalRows.map((row) => (
                    <li key={`critical-${row.place}-${row.time}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/6 bg-white/4 px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#ff344b]" />
                          <p className="truncate text-[13px] font-medium text-white/92">{row.place}</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-white/65">{row.time}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="lec-dashboard-card rounded-2xl border border-white/10 bg-[#0f1b49] p-3.5">
                <h3 className="text-sm font-semibold text-white">Response Log</h3>
                <ul className="mt-2.5 space-y-2.5">
                  {snapshot.responseRows.map((row) => (
                    <li key={`response-${row.place}-${row.time}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/6 bg-white/4 px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#2f7dfa]" />
                          <p className="truncate text-[13px] font-medium text-white/92">{row.place}</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-white/65">{row.time}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </div>
      </div>

      <div className="lec-laptop-hinge absolute bottom-8 left-1/2 h-4 w-[82%] -translate-x-1/2 rounded-b-[999px]" />
      <div className="lec-laptop-base absolute bottom-0 left-1/2 h-10 w-[132%] -translate-x-1/2 rounded-b-[999px]" />
      <div className="absolute bottom-[6px] left-1/2 h-3 w-28 -translate-x-1/2 rounded-b-[999px] bg-[#6f7ca1]/80" />
    </div>
  )
}
