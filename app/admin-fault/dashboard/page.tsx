import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TechnicianManagementPanel } from "@/components/admin-fault/TechnicianManagementPanel"

export default function AdminFaultDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="lec-page-title">Admin Fault Dashboard</h2>
        <p className="lec-page-subtitle">Manage ticket lifecycle, ownership, and escalation workflow.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">All Tickets</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-slate-600" />
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Assign Technician</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-slate-600" />
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Change Priority</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-slate-600" />
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Escalate Fault</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-slate-600" />
        </Card>
      </div>

      <TechnicianManagementPanel />
    </div>
  )
}

