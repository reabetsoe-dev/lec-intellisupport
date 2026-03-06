import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function EmployeeDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Employee Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">Submit and track IT issues with AI-assisted reporting.</p>
      </div>

      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 px-6 pb-6">
          <Button asChild className="bg-slate-900 text-white hover:bg-slate-800">
            <Link href="/employee/report">Report Fault</Link>
          </Button>
          <Button asChild variant="outline" className="border-slate-200">
            <Link href="/employee/tickets">My Tickets</Link>
          </Button>
          <Button asChild variant="outline" className="border-slate-200">
            <Link href="/employee/consumables">Apply Consumable</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
