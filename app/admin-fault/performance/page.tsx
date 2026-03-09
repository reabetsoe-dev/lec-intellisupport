import { PerformanceAnalyticsPanel } from "@/components/admin-fault/PerformanceAnalyticsPanel"

export default function AdminFaultPerformancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Performance Analytics</h2>
        <p className="mt-1 text-sm text-slate-500">
          Interactive KPI dashboard with downloadable chart images and CSV datasets for reporting.
        </p>
      </div>
      <PerformanceAnalyticsPanel />
    </div>
  )
}
