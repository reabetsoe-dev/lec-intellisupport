import { DashboardBackButton } from "@/components/layout/DashboardBackButton"
import { TicketConversationWorkspace } from "@/components/tickets/TicketConversationWorkspace"

type AdminFaultTicketDetailPageProps = {
  params: Promise<{ id: string }>
}

export default async function AdminFaultTicketDetailPage({ params }: AdminFaultTicketDetailPageProps) {
  const { id } = await Promise.resolve(params)
  const ticketId = Number(id)

  if (!Number.isFinite(ticketId)) {
    return <p className="text-sm text-rose-600">Invalid ticket id.</p>
  }

  return (
    <div className="space-y-4">
      <DashboardBackButton
        href="/admin-fault/tickets"
        ariaLabel="Return to all tickets"
        title="Return to all tickets"
      />
      <TicketConversationWorkspace ticketId={ticketId} viewerRole="admin_fault" />
    </div>
  )
}
