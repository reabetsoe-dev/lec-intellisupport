import { AdminConsumableRequestApprovalPanel } from "@/components/consumables/AdminConsumableRequestApprovalPanel"

export default function AdminConsumablesDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Admin Consumables Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">
          Review employee consumable requests and approve allocations based on stock levels.
        </p>
      </div>
      <AdminConsumableRequestApprovalPanel />
    </div>
  )
}
