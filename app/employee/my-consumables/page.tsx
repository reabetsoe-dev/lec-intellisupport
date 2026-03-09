import { EmployeeAssignedConsumablesPanel } from "@/components/consumables/EmployeeAssignedConsumablesPanel"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"

export default function EmployeeMyConsumablesPage() {
  return (
    <div className="space-y-6">
      <EmployeePageHero
        title="My Consumables"
        description="View all consumables assigned to you by the admin consumables team."
      />
      <EmployeeAssignedConsumablesPanel />
    </div>
  )
}

