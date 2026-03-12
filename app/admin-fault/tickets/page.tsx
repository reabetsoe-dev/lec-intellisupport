import { AdminFaultTicketTable } from "@/components/tickets/AdminFaultTicketTable"
import { AdminFaultBackButton } from "@/components/layout/AdminFaultBackButton"

export default function AdminFaultTicketsPage() {
  return (
    <div className="space-y-6">
      <AdminFaultBackButton />
      <div>
        <h2 className="lec-page-title">All Tickets</h2>
        <p className="lec-page-subtitle">
          Filter tickets and change assignment, classification, priority, and status from this tab.
        </p>
      </div>
      <AdminFaultTicketTable />
    </div>
  )
}

