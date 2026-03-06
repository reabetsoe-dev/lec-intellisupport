import { InventoryTable } from "@/components/inventory/InventoryTable"

export default function AdminConsumablesInventoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Inventory Table</h2>
        <p className="mt-1 text-sm text-slate-500">Track item quantities, department ownership, and assigned employees.</p>
      </div>
      <InventoryTable />
    </div>
  )
}
