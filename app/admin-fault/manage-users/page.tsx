import { TechnicianManagementPanel } from "@/components/admin-fault/TechnicianManagementPanel"
import { AdminFaultBackButton } from "@/components/layout/AdminFaultBackButton"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"

export default function AdminFaultManageUsersPage() {
  return (
    <div className="space-y-6">
      <AdminFaultBackButton />
      <EmployeePageHero
        title="Manage Users"
        description="Create and manage employee and technician accounts used in fault operations."
      />
      <TechnicianManagementPanel />
    </div>
  )
}
