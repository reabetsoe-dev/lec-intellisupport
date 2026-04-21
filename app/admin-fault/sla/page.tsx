import { SlaTrackingDashboard } from "@/components/sla/SlaTrackingDashboard"
import { AdminFaultBackButton } from "@/components/layout/AdminFaultBackButton"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"

export default function AdminFaultSlaPage() {
  return (
    <div className="space-y-6">
      <AdminFaultBackButton />
      <EmployeePageHero
        title="SLA Tracking Dashboard"
        description="Monitor acceptance pressure, inactivity risk, reassignment churn, and live escalation exposure across the ticket queue."
      />
      <SlaTrackingDashboard />
    </div>
  )
}
