import { notFound } from "next/navigation"

import { TechnicianTicketDetailPanel } from "@/components/tickets/TechnicianTicketDetailPanel"
import { tickets } from "@/components/tickets/ticket-data"

type TechnicianTicketDetailPageProps = {
  params: { id: string } | Promise<{ id: string }>
}

export default async function TechnicianTicketDetailPage({ params }: TechnicianTicketDetailPageProps) {
  const { id } = await Promise.resolve(params)
  const ticketId = Number(id)
  const ticket = tickets.find((item) => item.id === ticketId && item.technician === "Teboho M.")

  if (!ticket) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-slate-500">Ticket #{ticket.id}</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">{ticket.title}</h2>
      </div>
      <TechnicianTicketDetailPanel ticket={ticket} />
    </div>
  )
}
