import { PerformanceAnalyticsPanel } from "@/components/admin-fault/PerformanceAnalyticsPanel"

export default function AdminFaultPerformancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="lec-page-title">Performance Analytics</h2>
        <p className="lec-page-subtitle">
          Interactive KPI dashboard with downloadable chart images and CSV datasets for reporting.
        </p>
      </div>
      <PerformanceAnalyticsPanel />
    </div>
  )
}

