import { AdminConsumableRequestApprovalPanel } from "@/components/consumables/AdminConsumableRequestApprovalPanel"

export default function AdminConsumablesDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="lec-page-title">Admin Consumables Dashboard</h2>
        <p className="lec-page-subtitle">
          Review employee consumable requests and approve allocations based on stock levels.
        </p>
      </div>
      <AdminConsumableRequestApprovalPanel />
    </div>
  )
}

