import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AdminFaultDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Admin Fault Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">Manage ticket lifecycle, ownership, and escalation workflow.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">All Tickets</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-slate-600">86 open incidents and requests.</CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Assign Technician</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-slate-600">14 tickets currently unassigned.</CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Change Priority</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-slate-600">7 items updated to high priority today.</CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Escalate Fault</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-slate-600">5 active escalations under review.</CardContent>
        </Card>
      </div>
    </div>
  )
}
