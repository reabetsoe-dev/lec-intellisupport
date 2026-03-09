"use client"

import { useState } from "react"

import { TechnicianTicketTable } from "@/components/tickets/TechnicianTicketTable"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function TechnicianDashboardPage() {
  const [showAssignedTickets, setShowAssignedTickets] = useState(false)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="lec-page-title">Technician Dashboard</h2>
        <p className="lec-page-subtitle">Your queue overview and operational SLA focus.</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Assigned Tickets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6 text-sm text-slate-600">
            <p>Open your assigned ticket queue and use all actions (status update, escalate, open detail).</p>
            <Button
              className="bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => setShowAssignedTickets((current) => !current)}
            >
              {showAssignedTickets ? "Hide Assigned Tickets" : "Assigned Tickets"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {showAssignedTickets ? <TechnicianTicketTable /> : null}
    </div>
  )
}

