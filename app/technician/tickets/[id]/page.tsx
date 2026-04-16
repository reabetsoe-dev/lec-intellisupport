import { TechnicianBackButton } from "@/components/layout/TechnicianBackButton"
import { TicketConversationWorkspace } from "@/components/tickets/TicketConversationWorkspace"

type TechnicianTicketDetailPageProps = {
  params: Promise<{ id: string }>
}

export default async function TechnicianTicketDetailPage({ params }: TechnicianTicketDetailPageProps) {
  const { id } = await Promise.resolve(params)
  const ticketId = Number(id)
  if (!Number.isFinite(ticketId)) {
    return <p className="text-sm text-rose-600">Invalid ticket id.</p>
  }

  return (
    <div className="space-y-4">
      <TechnicianBackButton
        href="/technician/tickets"
        ariaLabel="Return to assigned tickets"
        title="Return to assigned tickets"
      />
      <TicketConversationWorkspace ticketId={ticketId} viewerRole="technician" />
    </div>
  )
}
