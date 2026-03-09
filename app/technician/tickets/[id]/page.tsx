import Link from "next/link"

import { Button } from "@/components/ui/button"
import { TechnicianTicketDetailWorkspace } from "@/components/tickets/TechnicianTicketDetailWorkspace"

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
      <Button asChild variant="outline" className="border-slate-200">
        <Link href="/technician/tickets">Back</Link>
      </Button>
      <TechnicianTicketDetailWorkspace ticketId={ticketId} />
    </div>
  )
}
