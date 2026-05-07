"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
import {
  createConsumableReturnRequest,
  getConsumableRequests,
  getConsumableReturns,
  type ConsumableRequest,
  type ConsumableReturn,
} from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"

const REFRESH_INTERVAL_MS = 15_000

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
  const router = useRouter()
  const [approvedRequests, setApprovedRequests] = useState<ConsumableRequest[]>([])
  const [returns, setReturns] = useState<ConsumableReturn[]>([])
  const [returnQuantityByRequestId, setReturnQuantityByRequestId] = useState<Record<number, string>>({})
  const [returnReasonByRequestId, setReturnReasonByRequestId] = useState<Record<number, string>>({})
  const [submittingReturnForId, setSubmittingReturnForId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [resultDialog, setResultDialog] = useState<{
    open: boolean
    status: "success" | "error"
    message: string
  }>({
    open: false,
    status: "success",
    message: "",
  })
  const user = getStoredUserSession()

  const showResultDialog = (status: "success" | "error", nextMessage: string) => {
    setResultDialog({
      open: true,
      status,
      message: nextMessage,
    })
  }

  const handleDialogOk = () => {
    setResultDialog((current) => ({ ...current, open: false }))
    router.push("/employee/dashboard")
  }

  const handleReturnAgain = () => {
    setResultDialog((current) => ({ ...current, open: false }))
  }

  const loadData = async (employeeId: number) => {
    const [requestData, returnData] = await Promise.all([
      getConsumableRequests(employeeId),
      getConsumableReturns(employeeId),
    ])
    setApprovedRequests(requestData.filter((request) => request.status === "approved"))
    setReturns(returnData)
  }

  useEffect(() => {
    const run = async (silent = false) => {
      if (!user?.id) {
        if (!silent) {
          setError("Session expired. Please login again.")
          setLoading(false)
        }
        return
      }

      try {
        await loadData(user.id)
      } catch (fetchError) {
        if (!silent) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load assigned consumables.")
        }
      } finally {
        if (!silent) {
          setLoading(false)
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
      const nextMessage = "Session expired. Please login again."
      setError(nextMessage)
      showResultDialog("error", nextMessage)
      return
    }

    setError("")
    setSuccess("")

    const quantityRaw = returnQuantityByRequestId[request.db_id] ?? ""
    const reason = (returnReasonByRequestId[request.db_id] ?? "").trim()
    const quantity = Number(quantityRaw)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      const nextMessage = "Return quantity must be greater than 0."
      setError(nextMessage)
      showResultDialog("error", nextMessage)
      return
    }
    if (!reason) {
      const nextMessage = "Return reason is required."
      setError(nextMessage)
      showResultDialog("error", nextMessage)
      return
    }

    const summary = returnSummaryByRequestId.get(request.db_id)
    const pending = summary?.pending ?? 0
    const received = summary?.received ?? 0
    const availableToReturn = request.quantity - pending - received
    if (quantity > availableToReturn) {
      const nextMessage = `Return quantity exceeds available quantity. Remaining quantity: ${availableToReturn}.`
      setError(nextMessage)
      showResultDialog("error", nextMessage)
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
      const nextMessage = `Return request submitted for ${request.itemName}.`
      setSuccess(nextMessage)
      showResultDialog("success", nextMessage)
    } catch (submitError) {
      const nextMessage = submitError instanceof Error ? submitError.message : "Failed to submit return request."
      setError(nextMessage)
      showResultDialog("error", nextMessage)
    } finally {
      setSubmittingReturnForId(null)
    }
  }

  return (
    <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-[#0072CE]/15 px-6 py-5">
        <CardTitle className="text-base font-semibold text-[#0B1F3A]">My Consumables</CardTitle>
      </CardHeader>
      <CardContent className="px-6 py-5">
        {error ? (
          <div role="alert" className="mb-4 rounded-lg border border-[#EDB0B0] bg-[#FFEAEA] px-4 py-3 text-sm text-[#8A2D2D]">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mb-4 rounded-lg border border-[#BEE3CF] bg-[#F3FBF6] px-4 py-3 text-sm text-[#176B4A]">
            {success}
          </div>
        ) : null}
        {loading ? (
          <p className="py-6 text-center text-sm text-[#1E3A6D]">Loading assigned consumables...</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#1E3A6D]">No consumables have been assigned to your profile yet.</p>
        ) : (
          <div className="space-y-4">
            {rows.map((request) => {
              const summary = returnSummaryByRequestId.get(request.db_id)
              const pending = summary?.pending ?? 0
              const received = summary?.received ?? 0
              const rejected = summary?.rejected ?? 0
              const availableToReturn = request.quantity - pending - received

              return (
                <div
                  key={request.db_id}
                  className="space-y-3 rounded-lg border border-[#0072CE]/20 bg-[#F8FBFF] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="break-words text-sm font-semibold text-[#0B1F3A]">{toDisplayLabel(request.itemName)}</h3>
                    <Badge className="rounded-full border border-slate-300 bg-slate-50 text-[#0B1F3A]">
                      {request.assignmentType}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-sm text-[#0B1F3A] sm:grid-cols-2">
                    <p><span className="font-semibold">Quantity:</span> {request.quantity}</p>
                    <p><span className="font-semibold">Department:</span> {request.department || "N/A"}</p>
                    <p><span className="font-semibold">Approved By:</span> {request.approvedBy || "Admin"}</p>
                    <p><span className="font-semibold">Approved At:</span> {formatDate(request.approvedAt ?? request.requestedAt)}</p>
                  </div>

                  <div className="rounded-md border border-[#0072CE]/20 bg-white p-3 text-xs text-[#0B1F3A]">
                    <p className="font-semibold">Return Status</p>
                    <p className="mt-1">Available to return: {availableToReturn}</p>
                    <p>Pending: {pending} | Received: {received} | Rejected: {rejected}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[#1E3A6D] uppercase tracking-wide">Request Return</p>
                    {availableToReturn <= 0 ? (
                      <p className="text-xs text-slate-500">No remaining quantity available for return.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-[120px_1fr_140px]">
                        <Input
                          type="number"
                          min={1}
                          max={availableToReturn}
                          placeholder={`Qty (${availableToReturn})`}
                          value={returnQuantityByRequestId[request.db_id] ?? ""}
                          onChange={(event) =>
                            setReturnQuantityByRequestId((current) => ({ ...current, [request.db_id]: event.target.value }))
                          }
                          className="h-9"
                        />
                        <Input
                          placeholder="Reason for return (e.g., no longer required)"
                          value={returnReasonByRequestId[request.db_id] ?? ""}
                          onChange={(event) =>
                            setReturnReasonByRequestId((current) => ({ ...current, [request.db_id]: event.target.value }))
                          }
                          className="h-9"
                        />
                        <Button
                          size="sm"
                          className="h-9 bg-[#0072CE] text-white hover:bg-[#005DA8]"
                          disabled={submittingReturnForId === request.db_id}
                          onClick={() => void handleSubmitReturn(request)}
                        >
                          {submittingReturnForId === request.db_id ? "Submitting..." : "Submit Return"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      <ActionFeedbackDialog
        open={resultDialog.open}
        status={resultDialog.status}
        message={resultDialog.message}
        onOk={handleDialogOk}
        secondaryActionLabel="Return Again"
        onSecondaryAction={handleReturnAgain}
      />
    </Card>
  )
}
