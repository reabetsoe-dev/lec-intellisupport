import { DashboardBackButton } from "@/components/layout/DashboardBackButton"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"
import { SlaTrackingDashboard } from "@/components/sla/SlaTrackingDashboard"

export default function ManagerSlaPage() {
  return (
    <div className="space-y-6">
      <DashboardBackButton href="/manager/dashboard" ariaLabel="Return to manager dashboard" title="Return to manager dashboard" />
      <EmployeePageHero
        compact
        title="SLA Tracking Dashboard"
        description="Executive SLA visibility for acceptance delays, breach risk, escalation pressure, and technician response health."
      />
      <SlaTrackingDashboard />
    </div>
  )
}
