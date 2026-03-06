"use client"

import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getStoredUserSession } from "@/lib/auth"
import {
  approveConsumableRequestById,
  getConsumableRequests as getConsumableRequestsApi,
  getConsumables,
  rejectConsumableRequestById,
  type Consumable,
  type ConsumableRequest,
} from "@/lib/api"

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString()
}

function normalizeItemName(value: string): string {
  return value.trim().toLowerCase()
}

function toDisplayItemName(value: string): string {
  return value
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ")
}

export function AdminConsumableRequestApprovalPanel() {
  const [requests, setRequests] = useState<ConsumableRequest[]>([])
  const [consumables, setConsumables] = useState<Consumable[]>([])
  const [error, setError] = useState("")
  const [processingId, setProcessingId] = useState("")
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({})
  const currentUser = getStoredUserSession()

  const pendingRequests = requests.filter((request) => request.status === "pending")
  const approvedRequests = requests.filter((request) => request.status === "approved")
  const rejectedRequests = requests.filter((request) => request.status === "rejected")

  const stockByName = useMemo(() => {
    const stockMap = new Map<string, number>()
    consumables.forEach((item) => {
      stockMap.set(normalizeItemName(item.item_name), item.quantity)
    })
    return stockMap
  }, [consumables])

  useEffect(() => {
    const run = async () => {
      try {
        setError("")
        const [inventoryData, requestData] = await Promise.all([getConsumables(), getConsumableRequestsApi()])
        setConsumables(inventoryData)
        setRequests(requestData)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load inventory stock.")
      }
    }

    void run()
  }, [])

  const handleApprove = async (requestId: string) => {
    const request = requests.find((item) => item.id === requestId)
    if (!request || request.status === "approved") {
      return
    }

    const matchedConsumable = consumables.find(
      (item) => normalizeItemName(item.item_name) === normalizeItemName(request.itemName)
    )
    if (!matchedConsumable) {
      setError(`Consumable item '${request.itemName}' was not found in inventory.`)
      return
    }

    if (request.quantity > matchedConsumable.quantity) {
      setError(`Insufficient stock for ${request.itemName}. Available: ${matchedConsumable.quantity}`)
      return
    }

    try {
      setProcessingId(requestId)
      setError("")
      await approveConsumableRequestById(request.db_id, currentUser?.id)
      const [inventoryData, requestData] = await Promise.all([getConsumables(), getConsumableRequestsApi()])
      setConsumables(inventoryData)
      setRequests(requestData)
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Failed to approve request.")
    } finally {
      setProcessingId("")
    }
  }

  const handleReject = (requestId: string) => {
    const request = requests.find((item) => item.id === requestId)
    if (!request || request.status !== "pending") {
      return
    }

    const reason = (rejectReasons[requestId] ?? "").trim()
    if (!reason) {
      setError("Please provide a reason before rejecting a request.")
      return
    }

    setError("")
    rejectConsumableRequestById(request.db_id, reason, currentUser?.id)
      .then(async () => {
        const requestData = await getConsumableRequestsApi()
        setRequests(requestData)
        setRejectReasons((current) => ({ ...current, [requestId]: "" }))
      })
      .catch((rejectError) => {
        setError(rejectError instanceof Error ? rejectError.message : "Failed to reject request.")
      })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Pending Approvals</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-2xl font-semibold text-slate-900">{pendingRequests.length}</CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Approved Requests</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-2xl font-semibold text-slate-900">{approvedRequests.length}</CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Rejected Requests</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-2xl font-semibold text-slate-900">{rejectedRequests.length}</CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Total Requests</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-2xl font-semibold text-slate-900">{requests.length}</CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">Consumable Request Queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? <p className="px-6 py-4 text-sm text-rose-600">{error}</p> : null}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-6 text-xs font-semibold tracking-wide text-slate-500 uppercase">Request</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Employee</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Department</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Item</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Qty</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Status</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Decision Notes</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => {
                const availableStock = stockByName.get(normalizeItemName(request.itemName)) ?? 0
                const canApprove = request.status === "pending" && request.quantity <= availableStock

                return (
                  <TableRow key={request.id}>
                    <TableCell className="px-6">
                      <p className="font-medium text-slate-800">{request.id}</p>
                      <p className="text-xs text-slate-500">{formatDate(request.requestedAt)}</p>
                    </TableCell>
                    <TableCell className="text-slate-700">{request.requestedBy}</TableCell>
                    <TableCell className="text-slate-700">{request.department}</TableCell>
                    <TableCell className="text-slate-700">{toDisplayItemName(request.itemName)}</TableCell>
                    <TableCell className="text-slate-700">{request.quantity}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          request.status === "approved"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : request.status === "rejected"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                        }
                      >
                        {request.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {request.status === "approved" ? (
                        <span>
                          Approved by {request.approvedBy ?? "Admin"} on {formatDate(request.approvedAt ?? request.requestedAt)}
                        </span>
                      ) : request.status === "rejected" ? (
                        <span>
                          Rejected by {request.rejectedBy ?? "Admin"} on {formatDate(request.rejectedAt ?? request.requestedAt)}.
                          {" "}
                          Reason: {request.rejectionReason ?? "No reason provided."}
                        </span>
                      ) : (
                        <textarea
                          className="min-h-20 w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                          placeholder="Reason for not providing this consumable"
                          value={rejectReasons[request.id] ?? ""}
                          onChange={(event) =>
                            setRejectReasons((current) => ({ ...current, [request.id]: event.target.value }))
                          }
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {request.status === "approved" || request.status === "rejected" ? (
                        <p className="text-xs text-slate-500">Decision completed</p>
                      ) : (
                        <div className="space-y-2">
                          <Button
                            size="sm"
                            className="bg-slate-900 text-white hover:bg-slate-800"
                            disabled={!canApprove || processingId === request.id}
                            onClick={() => void handleApprove(request.id)}
                          >
                            {processingId === request.id ? "Approving..." : "Approve"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-rose-300 text-rose-700 hover:bg-rose-50"
                            disabled={processingId === request.id}
                            onClick={() => handleReject(request.id)}
                          >
                            Reject
                          </Button>
                          {!canApprove ? (
                            <p className="text-xs text-red-600">Insufficient stock. Available: {availableStock}</p>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
