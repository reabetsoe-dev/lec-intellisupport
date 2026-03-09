import { AddConsumableForm } from "@/components/inventory/AddConsumableForm"

export default function AdminConsumablesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Assets</h2>
        <p className="mt-1 text-sm text-slate-500">View all assets or add a new inventory asset by category.</p>
      </div>
      <div>
        <AddConsumableForm />
      </div>
    </div>
  )
}
