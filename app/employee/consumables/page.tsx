import { EmployeeConsumableRequestPanel } from "@/components/consumables/EmployeeConsumableRequestPanel"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"

export default function EmployeeConsumablesPage() {
  return (
    <div className="space-y-3">
      <EmployeePageHero
        title="Consumable Request"
        description="Submit a consumable request and monitor admin approval decisions."
        compact
      />
      <div className="mx-auto w-full max-w-[1280px]">
        <EmployeeConsumableRequestPanel />
      </div>
    </div>
  )
}
