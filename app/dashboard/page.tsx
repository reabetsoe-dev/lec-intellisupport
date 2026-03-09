import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Role Workspace</h2>
        <p className="mt-1 text-sm text-slate-500">
          Switch between role-specific dashboards in the LEC IntelliSupport platform.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Employee</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-sm text-slate-500">AI-assisted fault reporting and personal ticket tracking.</p>
            <Link href="/employee" className="mt-4 inline-flex text-sm font-medium text-slate-900 hover:underline">
              Open dashboard
            </Link>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Technician</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-sm text-slate-500">Assigned tickets, SLA focus, and resolution execution.</p>
            <Link href="/technician" className="mt-4 inline-flex text-sm font-medium text-slate-900 hover:underline">
              Open dashboard
            </Link>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Admin Fault</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-sm text-slate-500">Cross-team ticket assignment, escalation, and SLA compliance.</p>
            <Link href="/admin-fault" className="mt-4 inline-flex text-sm font-medium text-slate-900 hover:underline">
              Open dashboard
            </Link>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Admin Consumables</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-sm text-slate-500">Manage stock levels and assignment of IT consumables.</p>
            <Link
              href="/admin-consumables"
              className="mt-4 inline-flex text-sm font-medium text-slate-900 hover:underline"
            >
              Open dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
