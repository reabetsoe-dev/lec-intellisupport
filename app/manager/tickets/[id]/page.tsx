import { ManagerBackButton } from "@/components/layout/ManagerBackButton"
import { TicketConversationWorkspace } from "@/components/tickets/TicketConversationWorkspace"

type ManagerTicketDetailPageProps = {
  params: Promise<{ id: string }>
}

export default async function ManagerTicketDetailPage({ params }: ManagerTicketDetailPageProps) {
  const { id } = await Promise.resolve(params)
  const ticketId = Number(id)

  if (!Number.isFinite(ticketId)) {
    return <p className="text-sm text-rose-600">Invalid ticket id.</p>
  }

  return (
    <div className="space-y-4">
      <ManagerBackButton href="/manager/tickets" label="Return to ticket oversight" />
      <TicketConversationWorkspace ticketId={ticketId} viewerRole="manager" />
    </div>
  )
}
