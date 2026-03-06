import { AdminFaultTicketTable } from "@/components/tickets/AdminFaultTicketTable"

export default function AdminFaultTicketsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">All Tickets</h2>
        <p className="mt-1 text-sm text-slate-500">Filter by priority or status and run assignment/escalation workflows.</p>
      </div>
      <AdminFaultTicketTable />
    </div>
  )
}
