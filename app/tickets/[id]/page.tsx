import { notFound } from "next/navigation"

import {
  priorityBadgeStyles,
  slaBadgeStyles,
  statusBadgeStyles,
  tickets,
} from "@/components/tickets/ticket-data"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type TicketDetailPageProps = {
  params: { id: string } | Promise<{ id: string }>
}

export default async function TicketDetailPage({ params }: TicketDetailPageProps) {
  const { id } = await Promise.resolve(params)
  const ticketId = Number(id)
  const ticket = tickets.find((item) => item.id === ticketId)

  if (!ticket) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-slate-500">Ticket #{ticket.id}</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">{ticket.title}</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm">
            <CardHeader className="px-6 py-5">
              <CardTitle className="text-base font-semibold text-slate-900">Description</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-6 pb-6">
              <p className="text-sm leading-6 text-slate-700">{ticket.description}</p>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Category</p>
                  <p className="mt-1 font-medium text-slate-800">{ticket.category}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Service</p>
                  <p className="mt-1 font-medium text-slate-800">{ticket.service}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm">
            <CardHeader className="px-6 py-5">
              <CardTitle className="text-base font-semibold text-slate-900">Comments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-6 pb-6">
              {ticket.comments.map((comment, index) => (
                <div key={`${comment.author}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-slate-800">{comment.author}</p>
                    <p className="text-xs text-slate-500">{comment.time}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{comment.message}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm">
            <CardHeader className="px-6 py-5">
              <CardTitle className="text-base font-semibold text-slate-900">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <ol className="space-y-4">
                {ticket.activity.map((item, index) => (
                  <li key={`${item.type}-${index}`} className="flex gap-3">
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-400" />
                    <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-slate-800">{item.type}</p>
                        <p className="text-xs text-slate-500">{item.time}</p>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm">
            <CardHeader className="px-6 py-5">
              <CardTitle className="text-base font-semibold text-slate-900">Status Panel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-6 pb-6">
              <div className="flex flex-wrap gap-2">
                <Badge className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusBadgeStyles[ticket.status])}>
                  {ticket.status}
                </Badge>
                <Badge
                  className={cn("rounded-full px-2 py-0.5 text-xs font-medium", priorityBadgeStyles[ticket.priority])}
                >
                  {ticket.priority}
                </Badge>
                <Badge className={cn("rounded-full px-2 py-0.5 text-xs font-medium", slaBadgeStyles[ticket.sla])}>
                  {ticket.sla}
                </Badge>
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Assigned Technician</span>
                  <span className="font-medium text-slate-800">{ticket.technician}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Requester</span>
                  <span className="font-medium text-slate-800">{ticket.requester}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">SLA Due</span>
                  <span className="font-medium text-slate-800">{ticket.dueBy}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Updated</span>
                  <span className="font-medium text-slate-800">{ticket.updatedAt}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm">
            <CardHeader className="px-6 py-5">
              <CardTitle className="text-base font-semibold text-slate-900">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-6 pb-6 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Created At</span>
                <span className="font-medium text-slate-800">{ticket.createdAt}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Ticket ID</span>
                <span className="font-medium text-slate-800">#{ticket.id}</span>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
