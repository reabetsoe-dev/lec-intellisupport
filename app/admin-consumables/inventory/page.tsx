import { InventoryTable } from "@/components/inventory/InventoryTable"

export default function AdminConsumablesInventoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="lec-page-title">Assets</h2>
        <p className="lec-page-subtitle">Review all inventory assets and current condition details.</p>
      </div>
      <InventoryTable />
    </div>
  )
}

