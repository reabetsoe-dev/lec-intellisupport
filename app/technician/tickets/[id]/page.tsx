import { TechnicianTicketDetailWorkspace } from "@/components/tickets/TechnicianTicketDetailWorkspace"

type TechnicianTicketDetailPageProps = {
  params: { id: string } | Promise<{ id: string }>
}

export default async function TechnicianTicketDetailPage({ params }: TechnicianTicketDetailPageProps) {
  const { id } = await Promise.resolve(params)
  const ticketId = Number(id)
  if (!Number.isFinite(ticketId)) {
    return <p className="text-sm text-rose-600">Invalid ticket id.</p>
  }

  return (
    <TechnicianTicketDetailWorkspace ticketId={ticketId} />
  )
}
