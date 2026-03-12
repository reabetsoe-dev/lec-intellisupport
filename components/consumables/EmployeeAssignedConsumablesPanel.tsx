"use client"

import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  createConsumableReturnRequest,
  getConsumableRequests,
  getConsumableReturns,
  type ConsumableRequest,
  type ConsumableReturn,
} from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"

function formatDate(value?: string | null): string {
  if (!value) {
    return "N/A"
  }
  return new Date(value).toLocaleString()
}

function toDisplayLabel(value: string): string {
  return value
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ")
}

export function EmployeeAssignedConsumablesPanel() {
  const [approvedRequests, setApprovedRequests] = useState<ConsumableRequest[]>([])
  const [returns, setReturns] = useState<ConsumableReturn[]>([])
  const [returnQuantityByRequestId, setReturnQuantityByRequestId] = useState<Record<number, string>>({})
  const [returnReasonByRequestId, setReturnReasonByRequestId] = useState<Record<number, string>>({})
  const [submittingReturnForId, setSubmittingReturnForId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const user = getStoredUserSession()

  const loadData = async (employeeId: number) => {
    const [requestData, returnData] = await Promise.all([
      getConsumableRequests(employeeId),
      getConsumableReturns(employeeId),
    ])
    setApprovedRequests(requestData.filter((request) => request.status === "approved"))
    setReturns(returnData)
  }

  useEffect(() => {
    const run = async () => {
      if (!user?.id) {
        setError("Session expired. Please login again.")
        setLoading(false)
        return
      }

      try {
        await loadData(user.id)
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load assigned consumables.")
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [user?.id])

  const returnSummaryByRequestId = useMemo(() => {
    const summary = new Map<number, { pending: number; received: number; rejected: number }>()
    returns.forEach((item) => {
      const current = summary.get(item.consumableRequestId) ?? { pending: 0, received: 0, rejected: 0 }
      if (item.status === "pending") {
        current.pending += item.quantity
      } else if (item.status === "received") {
        current.received += item.quantity
      } else if (item.status === "rejected") {
        current.rejected += item.quantity
      }
      summary.set(item.consumableRequestId, current)
    })
    return summary
  }, [returns])

  const rows = useMemo(() => {
    return [...approvedRequests].sort((a, b) => {
      const aTime = new Date(a.approvedAt ?? a.requestedAt).getTime()
      const bTime = new Date(b.approvedAt ?? b.requestedAt).getTime()
      return bTime - aTime
    })
  }, [approvedRequests])

  const handleSubmitReturn = async (request: ConsumableRequest) => {
    if (!user?.id) {
      setError("Session expired. Please login again.")
      return
    }

    setError("")
    setSuccess("")

    const quantityRaw = returnQuantityByRequestId[request.db_id] ?? ""
    const reason = (returnReasonByRequestId[request.db_id] ?? "").trim()
    const quantity = Number(quantityRaw)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Return quantity must be greater than 0.")
      return
    }
    if (!reason) {
      setError("Return reason is required.")
      return
    }

    const summary = returnSummaryByRequestId.get(request.db_id)
    const pending = summary?.pending ?? 0
    const received = summary?.received ?? 0
    const availableToReturn = request.quantity - pending - received
    if (quantity > availableToReturn) {
      setError(`Return quantity exceeds available quantity. Remaining quantity: ${availableToReturn}.`)
      return
    }

    try {
      setSubmittingReturnForId(request.db_id)
      await createConsumableReturnRequest({
        consumable_request_id: request.db_id,
        employee_id: user.id,
        quantity,
        reason,
      })
      setReturnQuantityByRequestId((current) => ({ ...current, [request.db_id]: "" }))
      setReturnReasonByRequestId((current) => ({ ...current, [request.db_id]: "" }))
      await loadData(user.id)
      setSuccess(`Return request submitted for ${request.itemName}.`)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit return request.")
    } finally {
      setSubmittingReturnForId(null)
    }
  }

  return (
    <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-[#0072CE]/15 px-6 py-5">
        <CardTitle className="text-base font-semibold text-[#0B1F3A]">My Consumables</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {error ? <p className="px-6 pt-4 text-sm text-[#D71920]">{error}</p> : null}
        {success ? <p className="px-6 pt-4 text-sm text-[#007A3D]">{success}</p> : null}
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-6 text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Item</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Quantity</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Type</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Department</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Approved By</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Approved At</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Return Status</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Request Return</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-[#1E3A6D]">
                  Loading assigned consumables...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-[#1E3A6D]">
                  No consumables have been assigned to your profile yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((request) => (
                <TableRow key={request.db_id}>
                  <TableCell className="px-6 font-medium text-[#0B1F3A]">{toDisplayLabel(request.itemName)}</TableCell>
                  <TableCell className="text-[#0B1F3A]">{request.quantity}</TableCell>
                  <TableCell>
                    <Badge className="rounded-full border border-slate-300 bg-slate-50 text-[#0B1F3A]">
                      {request.assignmentType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className="rounded-full border border-[#0072CE]/35 bg-[#E9F3FF] text-[#0B1F3A]">
                      {request.department || "N/A"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[#0B1F3A]">{request.approvedBy || "Admin"}</TableCell>
                  <TableCell className="text-[#0B1F3A]">{formatDate(request.approvedAt ?? request.requestedAt)}</TableCell>
                  <TableCell className="text-xs text-[#0B1F3A]">
                    {(() => {
                      const summary = returnSummaryByRequestId.get(request.db_id)
                      const pending = summary?.pending ?? 0
                      const received = summary?.received ?? 0
                      const rejected = summary?.rejected ?? 0
                      const availableToReturn = request.quantity - pending - received
                      return (
                        <div className="space-y-1">
                          <p>Available to return: {availableToReturn}</p>
                          <p>Pending: {pending} | Received: {received} | Rejected: {rejected}</p>
                        </div>
                      )
                    })()}
                  </TableCell>
                  <TableCell className="min-w-[280px]">
                    {(() => {
                      const summary = returnSummaryByRequestId.get(request.db_id)
                      const pending = summary?.pending ?? 0
                      const received = summary?.received ?? 0
                      const availableToReturn = request.quantity - pending - received

                      if (availableToReturn <= 0) {
                        return <p className="text-xs text-slate-500">No remaining quantity available for return.</p>
                      }

                      return (
                        <div className="space-y-2">
                          <Input
                            type="number"
                            min={1}
                            max={availableToReturn}
                            placeholder={`Qty (max ${availableToReturn})`}
                            value={returnQuantityByRequestId[request.db_id] ?? ""}
                            onChange={(event) =>
                              setReturnQuantityByRequestId((current) => ({ ...current, [request.db_id]: event.target.value }))
                            }
                            className="h-8"
                          />
                          <Input
                            placeholder="Reason for return (e.g., no longer required)"
                            value={returnReasonByRequestId[request.db_id] ?? ""}
                            onChange={(event) =>
                              setReturnReasonByRequestId((current) => ({ ...current, [request.db_id]: event.target.value }))
                            }
                            className="h-8"
                          />
                          <Button
                            size="sm"
                            className="bg-[#0072CE] text-white hover:bg-[#005DA8]"
                            disabled={submittingReturnForId === request.db_id}
                            onClick={() => void handleSubmitReturn(request)}
                          >
                            {submittingReturnForId === request.db_id ? "Submitting..." : "Submit Return"}
                          </Button>
                        </div>
                      )
                    })()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
