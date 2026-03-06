import { TicketTable } from "@/components/tickets/TicketTable"

export default function TicketsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Tickets</h2>
        <p className="mt-1 text-sm text-slate-500">
          Track incidents, service requests, and SLA performance across teams.
        </p>
      </div>

      <TicketTable />
    </div>
  )
}
