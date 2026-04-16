import { AdminConsumablesBackButton } from "@/components/layout/AdminConsumablesBackButton"
import { TicketConversationWorkspace } from "@/components/tickets/TicketConversationWorkspace"

type AdminConsumablesTicketDetailPageProps = {
  params: Promise<{ id: string }>
}

export default async function AdminConsumablesTicketDetailPage({
  params,
}: AdminConsumablesTicketDetailPageProps) {
  const { id } = await Promise.resolve(params)
  const ticketId = Number(id)

  if (!Number.isFinite(ticketId)) {
    return <p className="text-sm text-rose-600">Invalid ticket id.</p>
  }

  return (
    <div className="space-y-4">
      <AdminConsumablesBackButton
        href="/admin-consumables/dashboard"
        label="Return to admin consumables dashboard"
      />
      <TicketConversationWorkspace ticketId={ticketId} viewerRole="admin_consumables" />
    </div>
  )
}
