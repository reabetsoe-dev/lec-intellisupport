import { EmployeeTicketHistoryTable } from "@/components/tickets/EmployeeTicketHistoryTable"

export default function EmployeeTicketsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Employee Ticket History</h2>
        <p className="mt-1 text-sm text-slate-500">Track status, priority, and SLA indicators for your submitted tickets.</p>
      </div>
      <EmployeeTicketHistoryTable />
    </div>
  )
}
