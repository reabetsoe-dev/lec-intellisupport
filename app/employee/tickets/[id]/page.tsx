import { DashboardBackButton } from "@/components/layout/DashboardBackButton"
import { TicketConversationWorkspace } from "@/components/tickets/TicketConversationWorkspace"

type EmployeeTicketDetailPageProps = {
  params: Promise<{ id: string }>
}

export default async function EmployeeTicketDetailPage({ params }: EmployeeTicketDetailPageProps) {
  const { id } = await Promise.resolve(params)
  const ticketId = Number(id)

  if (!Number.isFinite(ticketId)) {
    return <p className="text-sm text-rose-600">Invalid ticket id.</p>
  }

  return (
    <div className="space-y-4">
      <DashboardBackButton href="/employee/tickets" ariaLabel="Return to my tickets" title="Return to my tickets" />
      <TicketConversationWorkspace ticketId={ticketId} viewerRole="employee" />
    </div>
  )
}
