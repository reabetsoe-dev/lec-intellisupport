import { AdminConsumableReturnHistoryPanel } from "@/components/consumables/AdminConsumableReturnHistoryPanel"
import { AdminConsumablesBackButton } from "@/components/layout/AdminConsumablesBackButton"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"

export default function AdminConsumablesReturnsPage() {
  return (
    <div className="space-y-6">
      <AdminConsumablesBackButton />
      <EmployeePageHero
        compact
        title="Consumable Return History"
        description="Audit all consumable return transactions, including status, employee, item, and decision history."
      />
      <AdminConsumableReturnHistoryPanel />
    </div>
  )
}

