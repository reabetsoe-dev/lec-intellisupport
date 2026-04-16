"use client"

import { useEffect, useMemo, useState } from "react"

import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
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

const REFRESH_INTERVAL_MS = 15_000
const metricCardClass = "rounded-xl border border-[#0072CE]/25 bg-white py-0 shadow-sm"
const compactFieldClass =
  "h-8 rounded-md border border-[#9FBAD6] bg-white px-2 text-xs text-[#1E3A6D] focus:outline-none focus:ring-2 focus:ring-[#0072CE]/30"
const noteFieldClass =
  "min-h-20 w-full rounded-md border border-[#9FBAD6] bg-white px-2 py-1 text-xs text-[#1E3A6D] placeholder:text-[#6A87A9] focus:outline-none focus:ring-2 focus:ring-[#0072CE]/30"

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

type AdminConsumableRequestApprovalPanelProps = {
  showRequestQueue?: boolean
  showReturnQueue?: boolean
}

type PendingAdminConsumableAction =
  | {
      kind: "approve-request"
      requestId: string
      label: string
    }
  | {
      kind: "reject-request"
      requestId: string
      label: string
    }
  | {
      kind: "receive-return"
      returnId: number
    }
  | {
      kind: "reject-return"
      returnId: number
    }

function getPendingActionCopy(action: PendingAdminConsumableAction | null): {
  title: string
  description: string
  confirmLabel: string
  confirmVariant: "default" | "destructive"
} {
  if (!action) {
    return {
      title: "",
      description: "",
      confirmLabel: "Confirm",
      confirmVariant: "default",
    }
  }

  switch (action.kind) {
    case "approve-request":
      return {
        title: "Approve Consumable Request",
        description: `Approve request ${action.label} and update stock levels now?`,
        confirmLabel: "Approve",
        confirmVariant: "default",
      }
    case "reject-request":
      return {
        title: "Reject Consumable Request",
        description: `Reject request ${action.label} using the reason you entered?`,
        confirmLabel: "Reject",
        confirmVariant: "destructive",
      }
    case "receive-return":
      return {
        title: "Receive Return",
        description: `Mark return RET-${action.returnId} as received and add the quantity back to inventory?`,
        confirmLabel: "Receive",
        confirmVariant: "default",
      }
    case "reject-return":
      return {
        title: "Reject Return Request",
        description: `Reject return RET-${action.returnId} using the reason you entered?`,
        confirmLabel: "Reject Return",
        confirmVariant: "destructive",
      }
  }
}

export function AdminConsumableRequestApprovalPanel({
  showRequestQueue = true,
  showReturnQueue = true,
}: AdminConsumableRequestApprovalPanelProps) {
  const [requests, setRequests] = useState<ConsumableRequest[]>([])
  const [consumables, setConsumables] = useState<Consumable[]>([])
  const [returns, setReturns] = useState<ConsumableReturn[]>([])
  const [error, setError] = useState("")
  const [processingId, setProcessingId] = useState("")
  const [assignmentTypeByRequestId, setAssignmentTypeByRequestId] = useState<Record<string, "new" | "loan" | "exchange">>({})
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({})
  const [returnRejectReasons, setReturnRejectReasons] = useState<Record<number, string>>({})
  const [processingReturnId, setProcessingReturnId] = useState<number | null>(null)
  const [resultDialog, setResultDialog] = useState<{
    open: boolean
    status: "success" | "error"
    message: string
  }>({
    open: false,
    status: "success",
    message: "",
  })
  const [pendingAction, setPendingAction] = useState<PendingAdminConsumableAction | null>(null)
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

  const showActionFeedback = (status: "success" | "error", message: string) => {
    setResultDialog({
      open: true,
      status,
      message,
    })
  }

  const loadAll = async (resetError = true) => {
    if (resetError) {
      setError("")
    }
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
    const run = async (silent = false) => {
      try {
        await loadAll(!silent)
      } catch (loadError) {
        if (!silent) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load inventory stock.")
        }
      }
    }

    void run()
    const intervalId = window.setInterval(() => {
      void run(true)
    }, REFRESH_INTERVAL_MS)
    const onFocus = () => {
      void run(true)
    }
    window.addEventListener("focus", onFocus)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
    }
  }, [])

  const handleApprove = (requestId: string) => {
    const request = requests.find((item) => item.id === requestId)
    if (!request || request.status === "approved") {
      return
    }

    const matchedConsumable = consumables.find(
      (item) => normalizeItemName(item.item_name) === normalizeItemName(request.itemName)
    )
    if (!matchedConsumable) {
      const nextMessage = `Consumable item '${request.itemName}' was not found in inventory.`
      setError(nextMessage)
      showActionFeedback("error", nextMessage)
      return
    }

    if (request.quantity > matchedConsumable.quantity) {
      const nextMessage = `Insufficient stock for ${request.itemName}. Available: ${matchedConsumable.quantity}`
      setError(nextMessage)
      showActionFeedback("error", nextMessage)
      return
    }

    setPendingAction({ kind: "approve-request", requestId, label: request.id })
  }

  const approveRequest = async (requestId: string) => {
    const request = requests.find((item) => item.id === requestId)
    if (!request || request.status === "approved") {
      return
    }
    try {
      setProcessingId(requestId)
      setError("")
      const assignmentType = assignmentTypeByRequestId[request.id] ?? request.assignmentType ?? "new"
      await approveConsumableRequestById(request.db_id, currentUser?.id, assignmentType)
      await loadAll()
      showActionFeedback("success", `Request ${request.id} approved and stock updated.`)
    } catch (approveError) {
      const nextMessage = approveError instanceof Error ? approveError.message : "Failed to approve request."
      setError(nextMessage)
      showActionFeedback("error", nextMessage)
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
      const nextMessage = "Please provide a reason before rejecting a request."
      setError(nextMessage)
      showActionFeedback("error", nextMessage)
      return
    }

    setPendingAction({ kind: "reject-request", requestId, label: request.id })
  }

  const rejectRequest = async (requestId: string) => {
    const request = requests.find((item) => item.id === requestId)
    if (!request || request.status !== "pending") {
      return
    }

    const reason = (rejectReasons[requestId] ?? "").trim()
    if (!reason) {
      const nextMessage = "Please provide a reason before rejecting a request."
      setError(nextMessage)
      showActionFeedback("error", nextMessage)
      return
    }

    try {
      setError("")
      setProcessingId(requestId)
      await rejectConsumableRequestById(request.db_id, reason, currentUser?.id)
      await loadAll()
      setRejectReasons((current) => ({ ...current, [requestId]: "" }))
      showActionFeedback("success", `Request ${request.id} rejected.`)
    } catch (rejectError) {
      const nextMessage = rejectError instanceof Error ? rejectError.message : "Failed to reject request."
      setError(nextMessage)
      showActionFeedback("error", nextMessage)
    } finally {
      setProcessingId("")
    }
  }

  const handleReceiveReturn = (returnId: number) => {
    setPendingAction({ kind: "receive-return", returnId })
  }

  const receiveReturn = async (returnId: number) => {
    try {
      setError("")
      setProcessingReturnId(returnId)
      await receiveConsumableReturn(returnId, currentUser?.id)
      await loadAll()
      showActionFeedback("success", `Return RET-${returnId} received and inventory updated.`)
    } catch (actionError) {
      const nextMessage = actionError instanceof Error ? actionError.message : "Failed to receive returned consumable."
      setError(nextMessage)
      showActionFeedback("error", nextMessage)
    } finally {
      setProcessingReturnId(null)
    }
  }

  const handleRejectReturn = (returnId: number) => {
    const reason = (returnRejectReasons[returnId] ?? "").trim()
    if (!reason) {
      const nextMessage = "Please provide a reason before rejecting a return request."
      setError(nextMessage)
      showActionFeedback("error", nextMessage)
      return
    }

    setPendingAction({ kind: "reject-return", returnId })
  }

  const rejectReturn = async (returnId: number) => {
    const reason = (returnRejectReasons[returnId] ?? "").trim()
    if (!reason) {
      const nextMessage = "Please provide a reason before rejecting a return request."
      setError(nextMessage)
      showActionFeedback("error", nextMessage)
      return
    }
    try {
      setError("")
      setProcessingReturnId(returnId)
      await rejectConsumableReturn(returnId, reason, currentUser?.id)
      setReturnRejectReasons((current) => ({ ...current, [returnId]: "" }))
      await loadAll()
      showActionFeedback("success", `Return RET-${returnId} rejected.`)
    } catch (actionError) {
      const nextMessage = actionError instanceof Error ? actionError.message : "Failed to reject return request."
      setError(nextMessage)
      showActionFeedback("error", nextMessage)
    } finally {
      setProcessingReturnId(null)
    }
  }

  const confirmPendingAction = async () => {
    if (!pendingAction) return

    try {
      if (pendingAction.kind === "approve-request") {
        await approveRequest(pendingAction.requestId)
      } else if (pendingAction.kind === "reject-request") {
        await rejectRequest(pendingAction.requestId)
      } else if (pendingAction.kind === "receive-return") {
        await receiveReturn(pendingAction.returnId)
      } else {
        await rejectReturn(pendingAction.returnId)
      }
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
        <Card className={metricCardClass}>
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-[#1E3A6D]">Pending Approvals</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-2xl font-semibold text-[#0B1F3A]">{pendingRequests.length}</CardContent>
        </Card>
        <Card className={metricCardClass}>
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-[#1E3A6D]">Approved Requests</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-2xl font-semibold text-[#0B1F3A]">{approvedRequests.length}</CardContent>
        </Card>
        <Card className={metricCardClass}>
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-[#1E3A6D]">Rejected Requests</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-2xl font-semibold text-[#0B1F3A]">{rejectedRequests.length}</CardContent>
        </Card>
        <Card className={metricCardClass}>
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-[#1E3A6D]">Total Requests</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-2xl font-semibold text-[#0B1F3A]">{requests.length}</CardContent>
        </Card>
        <Card className={metricCardClass}>
          <CardHeader className="px-6 py-5">
            <CardTitle className="text-base font-semibold text-[#1E3A6D]">Pending Returns</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-2xl font-semibold text-[#0B1F3A]">{pendingReturns.length}</CardContent>
        </Card>
      </div>

      {showRequestQueue ? (
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="border-b border-slate-100 px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">Consumable Request Queue</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {error ? <p className="px-6 py-4 text-sm text-rose-600">{error}</p> : null}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-y-0 bg-[#2E6EA0] hover:bg-[#2E6EA0]">
                    <TableHead className="w-[130px] px-6 py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Request</TableHead>
                    <TableHead className="w-[160px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Employee</TableHead>
                    <TableHead className="w-[160px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Department</TableHead>
                    <TableHead className="min-w-[210px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Item</TableHead>
                    <TableHead className="w-[70px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Qty</TableHead>
                    <TableHead className="w-[130px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Type</TableHead>
                    <TableHead className="w-[130px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Status</TableHead>
                    <TableHead className="min-w-[260px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Decision Notes</TableHead>
                    <TableHead className="w-[140px] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="px-6 py-6 text-center text-sm text-slate-500">
                        No consumable requests found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    requests.map((request) => {
                      const availableStock = stockByName.get(normalizeItemName(request.itemName)) ?? 0
                      const canApprove = request.status === "pending" && request.quantity <= availableStock

                      return (
                        <TableRow key={request.id} className="border-b border-[#C5D5E6] bg-[#F7FAFE] hover:bg-[#EAF2FA]">
                          <TableCell className="px-6 py-3">
                            <p className="text-xs font-semibold text-[#2A5D8D]">REQ-{request.id}</p>
                            <p className="text-xs text-[#4E7298]">{formatDate(request.requestedAt)}</p>
                          </TableCell>
                          <TableCell className="py-3 text-xs font-medium text-[#1F4469]">{request.requestedBy}</TableCell>
                          <TableCell className="py-3 text-xs text-[#234A71]">{request.department}</TableCell>
                          <TableCell className="py-3 text-xs text-[#234A71]">{toDisplayItemName(request.itemName)}</TableCell>
                          <TableCell className="py-3 text-xs text-[#234A71]">{request.quantity}</TableCell>
                          <TableCell className="py-3">
                            {request.status === "pending" ? (
                              <select
                                className={compactFieldClass}
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
                              <Badge variant="outline" className="border-[#9CC4EA] bg-[#EAF3FF] text-[#2E6092]">
                                {request.assignmentType}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="py-3">
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
                          <TableCell className="py-3 text-xs text-[#234A71]">
                            {request.status === "approved" ? (
                              <span>
                                Approved by {request.approvedBy ?? "Admin"} on {formatDate(request.approvedAt ?? request.requestedAt)}
                              </span>
                            ) : request.status === "rejected" ? (
                              <span>
                                Rejected by {request.rejectedBy ?? "Admin"} on {formatDate(request.rejectedAt ?? request.requestedAt)}.{" "}
                                Reason: {request.rejectionReason ?? "No reason provided."}
                              </span>
                            ) : (
                              <textarea
                                className={noteFieldClass}
                                placeholder="Reason for not providing this consumable"
                                value={rejectReasons[request.id] ?? ""}
                                onChange={(event) =>
                                  setRejectReasons((current) => ({ ...current, [request.id]: event.target.value }))
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell className="py-3">
                            {request.status === "approved" || request.status === "rejected" ? (
                              <p className="text-xs text-[#4E7298]">Decision completed</p>
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
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showReturnQueue ? (
        <>
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
        </>
      ) : null}

      <ActionConfirmationDialog
        open={Boolean(pendingAction)}
        title={getPendingActionCopy(pendingAction).title}
        description={getPendingActionCopy(pendingAction).description}
        confirmLabel={getPendingActionCopy(pendingAction).confirmLabel}
        confirmVariant={getPendingActionCopy(pendingAction).confirmVariant}
        confirmDisabled={processingId !== "" || processingReturnId !== null}
        onConfirm={() => void confirmPendingAction()}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null)
          }
        }}
      />

      <ActionFeedbackDialog
        open={resultDialog.open}
        status={resultDialog.status}
        message={resultDialog.message}
        onOk={() => setResultDialog((current) => ({ ...current, open: false }))}
      />
    </div>
  )
}
