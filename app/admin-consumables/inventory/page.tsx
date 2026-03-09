import { InventoryTable } from "@/components/inventory/InventoryTable"

export default function AdminConsumablesInventoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Assets</h2>
        <p className="mt-1 text-sm text-slate-500">Review all inventory assets and current condition details.</p>
      </div>
      <InventoryTable />
    </div>
  )
}
