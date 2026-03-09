import { TicketTable } from "@/components/tickets/TicketTable"

export default function TicketsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="lec-page-title">Tickets</h2>
        <p className="lec-page-subtitle">
          Track incidents, service requests, and SLA performance across teams.
        </p>
      </div>

      <TicketTable />
    </div>
  )
}

