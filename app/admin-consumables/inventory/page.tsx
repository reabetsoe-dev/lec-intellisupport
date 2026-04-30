import Link from "next/link"

import { InventoryTable } from "@/components/inventory/InventoryTable"
import { AdminConsumablesBackButton } from "@/components/layout/AdminConsumablesBackButton"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"
import { Button } from "@/components/ui/button"

export default function AdminConsumablesInventoryPage() {
  return (
    <div className="space-y-6">
      <AdminConsumablesBackButton />
      <EmployeePageHero
        compact
        title="Assets Inventory"
        description="Review inventory assets, current stock levels, and condition details."
      />
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className="border-[#7EB3E4] bg-white text-[#0A2445]">
          <Link href="/admin-consumables/inventory/labels">Open Scan QR Labels</Link>
        </Button>
        <Button asChild variant="outline" className="border-[#7EB3E4] bg-white text-[#0A2445]">
          <Link href="/admin-consumables/inventory/fault-labels">Open Fault QR Labels</Link>
        </Button>
      </div>
      <InventoryTable />
    </div>
  )
}

