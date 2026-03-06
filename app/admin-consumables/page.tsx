import { AddConsumableForm } from "@/components/inventory/AddConsumableForm"

export default function AdminConsumablesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Add Consumable</h2>
        <p className="mt-1 text-sm text-slate-500">Create and assign a new consumable allocation.</p>
      </div>
      <div className="max-w-2xl">
        <AddConsumableForm />
      </div>
    </div>
  )
}
