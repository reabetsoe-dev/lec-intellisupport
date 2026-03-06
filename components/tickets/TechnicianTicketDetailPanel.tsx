"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  priorityBadgeStyles,
  slaBadgeStyles,
  statusBadgeStyles,
  type Ticket,
  type TicketStatus,
} from "@/components/tickets/ticket-data"
import { cn } from "@/lib/utils"

const statusChoices: TicketStatus[] = ["Open", "In Progress", "Pending Vendor", "Resolved"]

type TechnicianTicketDetailPanelProps = {
  ticket: Ticket
}

export function TechnicianTicketDetailPanel({ ticket }: TechnicianTicketDetailPanelProps) {
  const [status, setStatus] = useState<TicketStatus>(ticket.status)
  const [resolution, setResolution] = useState("")
  const [comment, setComment] = useState("")
  const [localComments, setLocalComments] = useState(ticket.comments)

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Ticket Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-6 pb-6">
            <p className="text-sm leading-6 text-slate-700">{ticket.description}</p>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Employee</p>
                <p className="mt-1 font-medium text-slate-800">{ticket.requester}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Category</p>
                <p className="mt-1 font-medium text-slate-800">{ticket.category}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Comments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-6 pb-6">
            {localComments.map((item, index) => (
              <div key={`${item.author}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold text-slate-800">{item.author}</p>
                  <p className="text-xs text-slate-500">{item.time}</p>
                </div>
                <p className="mt-2 text-sm text-slate-700">{item.message}</p>
              </div>
            ))}
            <div className="space-y-2">
              <Input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Add technician comment"
              />
              <Button
                variant="outline"
                className="border-slate-200"
                onClick={() => {
                  if (!comment.trim()) {
                    return
                  }
                  setLocalComments((current) => [
                    { author: "Teboho M.", message: comment, time: "Now" },
                    ...current,
                  ])
                  setComment("")
                }}
              >
                Add Comment
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-6">
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Status and SLA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-6 pb-6">
            <div className="flex flex-wrap gap-2">
              <Badge className={cn("rounded-full px-2 py-0.5", statusBadgeStyles[status])}>{status}</Badge>
              <Badge className={cn("rounded-full px-2 py-0.5", priorityBadgeStyles[ticket.priority])}>
                {ticket.priority}
              </Badge>
              <Badge className={cn("rounded-full px-2 py-0.5", slaBadgeStyles[ticket.sla])}>{ticket.sla}</Badge>
            </div>

            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as TicketStatus)}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
            >
              {statusChoices.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Resolution Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6">
            <textarea
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              placeholder="Document root cause and applied fix..."
              className="min-h-32 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
            />
            <Button className="w-full bg-slate-900 text-white hover:bg-slate-800">Save Resolution</Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
