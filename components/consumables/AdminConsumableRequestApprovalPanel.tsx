"use client"

import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getStoredUserSession } from "@/lib/auth"
import {
  approveConsumableRequestById,
  getConsumableReturns,
  getConsumableRequests as getConsumableRequestsApi,
  getConsumables,
  receiveConsumableReturn,
  rejectConsumableReturn,
  rejectConsumableRequestById,
  type Consumable,
  type ConsumableRequest,
  type ConsumableReturn,
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
  const [returns, setReturns] = useState<ConsumableReturn[]>([])
  const [error, setError] = useState("")
  const [processingId, setProcessingId] = useState("")
  const [assignmentTypeByRequestId, setAssignmentTypeByRequestId] = useState<Record<string, "new" | "loan" | "exchange">>({})
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({})
  const [returnRejectReasons, setReturnRejectReasons] = useState<Record<number, string>>({})
  const [processingReturnId, setProcessingReturnId] = useState<number | null>(null)
  const currentUser = getStoredUserSession()

  const pendingRequests = requests.filter((request) => request.status === "pending")
  const approvedRequests = requests.filter((request) => request.status === "approved")
  const rejectedRequests = requests.filter((request) => request.status === "rejected")
  const pendingReturns = returns.filter((item) => item.status === "pending")
  const receivedReturns = returns.filter((item) => item.status === "received")

  const stockByName = useMemo(() => {
    const stockMap = new Map<string, number>()
    consumables.forEach((item) => {
      stockMap.set(normalizeItemName(item.item_name), item.quantity)
    })
    return stockMap
  }, [consumables])

  const loadAll = async () => {
    setError("")
    const [inventoryData, requestData, returnData] = await Promise.all([
      getConsumables(),
      getConsumableRequestsApi(),
      getConsumableReturns(),
    ])
    setConsumables(inventoryData)
    setRequests(requestData)
    setReturns(returnData)
  }

  useEffect(() => {
    const run = async () => {
      try {
        await loadAll()
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
      const assignmentType = assignmentTypeByRequestId[request.id] ?? request.assignmentType ?? "new"
      await approveConsumableRequestById(request.db_id, currentUser?.id, assignmentType)
      await loadAll()
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
        await loadAll()
        setRejectReasons((current) => ({ ...current, [requestId]: "" }))
      })
      .catch((rejectError) => {
        setError(rejectError instanceof Error ? rejectError.message : "Failed to reject request.")
      })
  }

  const handleReceiveReturn = async (returnId: number) => {
    try {
      setError("")
      setProcessingReturnId(returnId)
      await receiveConsumableReturn(returnId, currentUser?.id)
      await loadAll()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to receive returned consumable.")
    } finally {
      setProcessingReturnId(null)
    }
  }

  const handleRejectReturn = async (returnId: number) => {
    const reason = (returnRejectReasons[returnId] ?? "").trim()
    if (!reason) {
      setError("Please provide a reason before rejecting a return request.")
      return
    }

    try {
      setError("")
      setProcessingReturnId(returnId)
      await rejectConsumableReturn(returnId, reason, currentUser?.id)
      setReturnRejectReasons((current) => ({ ...current, [returnId]: "" }))
      await loadAll()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to reject return request.")
    } finally {
      setProcessingReturnId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
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
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Pending Returns</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-2xl font-semibold text-slate-900">{pendingReturns.length}</CardContent>
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
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Type</TableHead>
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
                    <TableCell className="text-slate-700">
                      {request.status === "pending" ? (
                        <select
                          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
                          value={assignmentTypeByRequestId[request.id] ?? request.assignmentType ?? "new"}
                          onChange={(event) =>
                            setAssignmentTypeByRequestId((current) => ({
                              ...current,
                              [request.id]: event.target.value as "new" | "loan" | "exchange",
                            }))
                          }
                        >
                          <option value="new">New</option>
                          <option value="loan">Loan</option>
                          <option value="exchange">Exchange</option>
                        </select>
                      ) : (
                        <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                          {request.assignmentType}
                        </Badge>
                      )}
                    </TableCell>
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

      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">Consumable Return Queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-6 text-xs font-semibold tracking-wide text-slate-500 uppercase">Return ID</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Employee</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Item</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Type</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Qty</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Reason</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Status</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-slate-500">
                    No return requests found.
                  </TableCell>
                </TableRow>
              ) : (
                returns.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="px-6 font-medium text-slate-800">RET-{item.id}</TableCell>
                    <TableCell className="text-slate-700">{item.employeeName}</TableCell>
                    <TableCell className="text-slate-700">{toDisplayItemName(item.itemName)}</TableCell>
                    <TableCell className="text-slate-700">{item.assignmentType}</TableCell>
                    <TableCell className="text-slate-700">{item.quantity}</TableCell>
                    <TableCell className="max-w-[280px] text-xs text-slate-600">{item.reason || "N/A"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          item.status === "received"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : item.status === "rejected"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                        }
                      >
                        {item.status}
                      </Badge>
                      {item.status === "received" ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Received by {item.receivedBy ?? "Admin"} on {formatDate(item.receivedAt ?? item.createdAt)}
                        </p>
                      ) : null}
                      {item.status === "rejected" ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Rejected by {item.rejectedBy ?? "Admin"} on {formatDate(item.rejectedAt ?? item.createdAt)}.
                          {" "}
                          Reason: {item.rejectionReason ?? "No reason provided."}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {item.status !== "pending" ? (
                        <p className="text-xs text-slate-500">Decision completed</p>
                      ) : (
                        <div className="space-y-2">
                          <Button
                            size="sm"
                            className="bg-slate-900 text-white hover:bg-slate-800"
                            disabled={processingReturnId === item.id}
                            onClick={() => void handleReceiveReturn(item.id)}
                          >
                            {processingReturnId === item.id ? "Receiving..." : "Receive Return"}
                          </Button>
                          <textarea
                            className="min-h-20 w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                            placeholder="Reason for rejecting this return request"
                            value={returnRejectReasons[item.id] ?? ""}
                            onChange={(event) =>
                              setReturnRejectReasons((current) => ({ ...current, [item.id]: event.target.value }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-rose-300 text-rose-700 hover:bg-rose-50"
                            disabled={processingReturnId === item.id}
                            onClick={() => void handleRejectReturn(item.id)}
                          >
                            Reject Return
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {receivedReturns.length > 0 ? (
        <p className="text-xs text-slate-500">Total received returns recorded: {receivedReturns.length}</p>
      ) : null}
    </div>
  )
}
