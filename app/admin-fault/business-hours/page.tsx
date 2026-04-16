import { BusinessHoursPanel } from "@/components/admin-fault/BusinessHoursPanel"
import { AdminFaultBackButton } from "@/components/layout/AdminFaultBackButton"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"

export default function AdminFaultBusinessHoursPage() {
  return (
    <div className="space-y-6">
      <AdminFaultBackButton />
      <EmployeePageHero
        title="Business Hours"
        description="Configure support operating hours, holiday closures, and technician group scope for automatic routing."
      />
      <BusinessHoursPanel />
    </div>
  )
}
