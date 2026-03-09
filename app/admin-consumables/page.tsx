import { AddConsumableForm } from "@/components/inventory/AddConsumableForm"

export default function AdminConsumablesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="lec-page-title">Assets</h2>
        <p className="lec-page-subtitle">View all assets or add a new inventory asset by category.</p>
      </div>
      <div>
        <AddConsumableForm />
      </div>
    </div>
  )
}

