import { TechnicianTicketTable } from "@/components/tickets/TechnicianTicketTable"

export default function TechnicianTicketsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="lec-page-title">Assigned Tickets</h2>
        <p className="lec-page-subtitle">Only tickets assigned to your technician account are shown here.</p>
      </div>
      <TechnicianTicketTable />
    </div>
  )
}

