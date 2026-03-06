import { EmployeeConsumableRequestPanel } from "@/components/consumables/EmployeeConsumableRequestPanel"

export default function EmployeeConsumablesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Consumable Requests</h2>
        <p className="mt-1 text-sm text-slate-500">Apply for consumables and track approval status from admin.</p>
      </div>
      <EmployeeConsumableRequestPanel />
    </div>
  )
}
