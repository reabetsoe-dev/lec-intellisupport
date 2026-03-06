import { TechnicianTicketTable } from "@/components/tickets/TechnicianTicketTable"

export default function TechnicianTicketsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Assigned Tickets</h2>
        <p className="mt-1 text-sm text-slate-500">Only tickets assigned to your technician account are shown here.</p>
      </div>
      <TechnicianTicketTable />
    </div>
  )
}
