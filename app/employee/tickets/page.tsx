import { EmployeeTicketHistoryTable } from "@/components/tickets/EmployeeTicketHistoryTable"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"

export default function EmployeeTicketsPage() {
  return (
    <div className="space-y-6">
      <EmployeePageHero
        title="My Tickets"
        description="Track the status and priority of all your submitted tickets."
      />
      <EmployeeTicketHistoryTable />
    </div>
  )
}
