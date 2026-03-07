"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  createTicketMaterialRequest,
  escalateTicket,
  getTechnicians,
  getTicketById,
  getTicketMaterialRequests,
  type Technician,
  type TicketDetail,
  type TicketMaterialRequest,
  updateTicketStatus,
} from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"

const statusChoices = ["Open", "In Progress", "Pending Vendor", "Resolved"]

type TechnicianTicketDetailWorkspaceProps = {
  ticketId: number
}

export function TechnicianTicketDetailWorkspace({ ticketId }: TechnicianTicketDetailWorkspaceProps) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [materialRequests, setMaterialRequests] = useState<TicketMaterialRequest[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [statusValue, setStatusValue] = useState("Open")
  const [escalationTarget, setEscalationTarget] = useState<string>("")
  const [escalationComment, setEscalationComment] = useState("")
  const [materialName, setMaterialName] = useState("")
  const [materialQty, setMaterialQty] = useState("1")
  const [materialNotes, setMaterialNotes] = useState("")
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const currentUser = getStoredUserSession()

  const loadAll = async () => {
    const [ticketData, requestData, techData] = await Promise.all([
      getTicketById(ticketId),
      getTicketMaterialRequests(ticketId),
      getTechnicians(),
    ])
    setTicket(ticketData)
    setMaterialRequests(requestData)
    setTechnicians(techData)
    setStatusValue(ticketData.status)
  }

  useEffect(() => {
    const run = async () => {
      try {
        await loadAll()
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load ticket details.")
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [ticketId])

  const escalationOptions = useMemo(() => {
    return technicians.filter((item) => item.user_id !== currentUser?.id)
  }, [technicians, currentUser?.id])

  const handleUpdateStatus = async () => {
    if (!ticket) {
      return
    }
    try {
      setError("")
      setSuccess("")
      setActionLoading(true)
      const updated = await updateTicketStatus(ticket.id, statusValue)
      setTicket((current) => (current ? { ...current, status: updated.status } : current))
      setSuccess("Ticket status updated.")
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update status.")
    } finally {
      setActionLoading(false)
    }
  }

  const handleEscalate = async () => {
    if (!ticket || !currentUser) {
      return
    }
    if (!escalationTarget) {
      setError("Choose an escalation target first.")
      return
    }
    if (!escalationComment.trim()) {
      setError("Escalation comment is required.")
      return
    }

    try {
      setError("")
      setSuccess("")
      setActionLoading(true)

      if (escalationTarget === "admin_fault") {
        await escalateTicket(ticket.id, currentUser.id, null, escalationComment.trim(), "admin_fault")
      } else {
        await escalateTicket(ticket.id, currentUser.id, Number(escalationTarget), escalationComment.trim())
      }

      setEscalationComment("")
      await loadAll()
      setSuccess("Escalation submitted.")
    } catch (escalateError) {
      setError(escalateError instanceof Error ? escalateError.message : "Failed to escalate ticket.")
    } finally {
      setActionLoading(false)
    }
  }

  const handleMaterialRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ticket || !currentUser) {
      return
    }

    const quantity = Number(materialQty)
    if (!materialName.trim()) {
      setError("Material name is required.")
      return
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Material quantity must be greater than 0.")
      return
    }

    try {
      setError("")
      setSuccess("")
      setActionLoading(true)
      await createTicketMaterialRequest(ticket.id, {
        requested_by_id: currentUser.id,
        item_name: materialName.trim(),
        quantity,
        notes: materialNotes.trim(),
      })
      setMaterialName("")
      setMaterialQty("1")
      setMaterialNotes("")
      const updatedRequests = await getTicketMaterialRequests(ticket.id)
      setMaterialRequests(updatedRequests)
      const updatedTicket = await getTicketById(ticket.id)
      setTicket(updatedTicket)
      setSuccess("Material request submitted.")
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to request material.")
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading ticket details...</p>
  }

  if (!ticket) {
    return <p className="text-sm text-rose-600">Ticket not found.</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-slate-500">Ticket #{ticket.id}</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">{ticket.title}</h2>
      </div>

      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">Reported Problem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-6 pb-6 text-sm text-slate-700">
          <p>{ticket.description}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Category: {ticket.category}</Badge>
            <Badge variant="outline">Priority: {ticket.priority}</Badge>
            <Badge variant="outline">Status: {ticket.status}</Badge>
            <Badge variant="outline">Employee: {ticket.employee_name ?? ticket.employee_id}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">Technician Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 px-6 pb-6">
          <div className="space-y-2">
            <label htmlFor="status-select" className="text-sm font-medium text-slate-700">
              Update Status
            </label>
            <div className="flex gap-2">
              <select
                id="status-select"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
                value={statusValue}
                onChange={(event) => setStatusValue(event.target.value)}
              >
                {statusChoices.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
              <Button onClick={handleUpdateStatus} disabled={actionLoading}>
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-700">Escalate</p>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
              value={escalationTarget}
              onChange={(event) => setEscalationTarget(event.target.value)}
            >
              <option value="">Select target</option>
              {escalationOptions.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.name}
                </option>
              ))}
              <option value="admin_fault">Back to Admin Fault</option>
            </select>
            <textarea
              className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800"
              placeholder="Explain why you are escalating this ticket."
              value={escalationComment}
              onChange={(event) => setEscalationComment(event.target.value)}
            />
            <Button onClick={handleEscalate} disabled={actionLoading} className="bg-slate-900 text-white hover:bg-slate-800">
              Escalate Ticket
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">Request Hardware / Material</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6">
          <form className="space-y-3" onSubmit={handleMaterialRequest}>
            <Input
              placeholder="Item name (e.g. Keyboard, RAM, Ethernet cable)"
              value={materialName}
              onChange={(event) => setMaterialName(event.target.value)}
            />
            <Input
              type="number"
              min={1}
              value={materialQty}
              onChange={(event) => setMaterialQty(event.target.value)}
            />
            <textarea
              className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800"
              placeholder="Reason for this request"
              value={materialNotes}
              onChange={(event) => setMaterialNotes(event.target.value)}
            />
            <Button type="submit" disabled={actionLoading}>
              Submit Material Request
            </Button>
          </form>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">Request History</p>
            {materialRequests.length === 0 ? (
              <p className="text-sm text-slate-500">No material requests yet.</p>
            ) : (
              materialRequests.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="font-medium text-slate-800">
                    {item.item_name} x{item.quantity}
                  </p>
                  <p className="text-slate-600">{item.notes || "No notes"}</p>
                  <p className="text-xs text-slate-500">
                    {item.requested_by_name} | {item.status} | {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">Ticket Comments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-6 pb-6">
          {ticket.comments.length === 0 ? (
            <p className="text-sm text-slate-500">No comments yet.</p>
          ) : (
            ticket.comments.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-800">{item.author_name}</p>
                <p className="text-slate-700">{item.comment}</p>
                <p className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
    </div>
  )
}
