import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function TechnicianDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Technician Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">Your queue overview and operational SLA focus.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Assigned Tickets</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-slate-600">12 active tickets in your queue.</CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Priority Tickets</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-slate-600">4 high-priority issues need immediate action.</CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">SLA Warnings</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-sm text-slate-600">1 ticket is close to SLA breach.</CardContent>
        </Card>
      </div>
    </div>
  )
}
