"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import {
  createConsumableRequest as createConsumableRequestApi,
  getConsumableRequests as getConsumableRequestsApi,
  getConsumables,
  type Consumable,
  type ConsumableRequest,
} from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"
import {
  getInterfaceTileClassName,
  getInterfaceTileDescriptionClassName,
  getInterfaceTileTitleClassName,
} from "@/lib/interface-card-styles"
import { BRANCH_OPTIONS, DEPARTMENT_OPTIONS } from "@/lib/organization-options"
import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const REFRESH_INTERVAL_MS = 15_000
const DEFAULT_REQUEST_QUANTITY = 1
const TECHNICIAN_ASSET_LABELS = ["Laptop", "Desktop", "Mouse", "Keyboard", "Gadget"] as const

type TechnicianAssetLabel = (typeof TECHNICIAN_ASSET_LABELS)[number]

type ConsumableSelectOption = {
  key: string
  label: string
  value: string
  disabled: boolean
}

function toDisplayItemName(value: string): string {
  return value
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ")
}

function getTechnicianAssetLabel(item: Consumable): TechnicianAssetLabel | null {
  const searchable = [
    item.item_name,
    item.category,
    item.subcategory,
    item.device_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (searchable.includes("laptop")) {
    return "Laptop"
  }
  if (searchable.includes("desktop")) {
    return "Desktop"
  }
  if (searchable.includes("mouse")) {
    return "Mouse"
  }
  if (searchable.includes("keyboard")) {
    return "Keyboard"
  }
  if (searchable.includes("gadget")) {
    return "Gadget"
  }
  return null
}

export function EmployeeConsumableRequestPanel() {
  const [activeView, setActiveView] = useState<"request" | "history">("request")
  const [itemName, setItemName] = useState("")
  const [assignmentType, setAssignmentType] = useState<"" | "new" | "loan" | "exchange">("")
  const [expectedReturnDate, setExpectedReturnDate] = useState("")
  const [branch, setBranch] = useState("")
  const [department, setDepartment] = useState("")
  const [notes, setNotes] = useState("")
  const [resultDialog, setResultDialog] = useState<{
    open: boolean
    status: "success" | "error"
    message: string
  }>({
    open: false,
    status: "success",
    message: "",
  })
  const [loadingStock, setLoadingStock] = useState(true)
  const [consumables, setConsumables] = useState<Consumable[]>([])
  const [requests, setRequests] = useState<ConsumableRequest[]>([])
  const router = useRouter()

  const user = getStoredUserSession()
  const isTechnician = user?.role === "technician"

  const itemOptions = useMemo<ConsumableSelectOption[]>(() => {
    if (!isTechnician) {
      return consumables.map((item) => ({
        key: String(item.id),
        label: toDisplayItemName(item.item_name),
        value: item.item_name,
        disabled: false,
      }))
    }
    const optionsByLabel = new Map<TechnicianAssetLabel, Consumable>()
    for (const item of consumables) {
      const label = getTechnicianAssetLabel(item)
      if (!label || optionsByLabel.has(label)) {
        continue
      }
      optionsByLabel.set(label, item)
    }
    return TECHNICIAN_ASSET_LABELS.map((label) => {
      const item = optionsByLabel.get(label)
      return {
        key: item ? String(item.id) : `missing-${label}`,
        label: item ? label : `${label} (unavailable)`,
        value: item?.item_name ?? "",
        disabled: !item,
      }
    })
  }, [consumables, isTechnician])

  const showResultDialog = (status: "success" | "error", nextMessage: string) => {
    setResultDialog({
      open: true,
      status,
      message: nextMessage,
    })
  }

  const handleDialogOk = () => {
    setResultDialog((current) => ({ ...current, open: false }))
    const dashboardPath = user?.role === "technician" ? "/technician/dashboard" : "/employee/dashboard"
    router.push(dashboardPath)
  }

  const handleRequestAgain = () => {
    setResultDialog((current) => ({ ...current, open: false }))
  }

  useEffect(() => {
    const run = async (silent = false) => {
      try {
        const [inventoryData, requestData] = await Promise.all([
          getConsumables(),
          getConsumableRequestsApi(user?.id),
        ])
        setConsumables(
          inventoryData
            .filter((item) => item.item_name.trim() && item.quantity > 0)
            .sort((a, b) => a.item_name.localeCompare(b.item_name))
        )
        setRequests(requestData)
      } catch (loadError) {
        if (!silent) {
          showResultDialog("error", loadError instanceof Error ? loadError.message : "Failed to load consumable stock.")
        }
      } finally {
        if (!silent) {
          setLoadingStock(false)
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

  const myRequests = requests

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!itemName) {
      const nextMessage = "No consumable item available."
      showResultDialog("error", nextMessage)
      return
    }
    if (!assignmentType) {
      const nextMessage = "Please select assignment type (new, loan, or exchange)."
      showResultDialog("error", nextMessage)
      return
    }

    if (!branch.trim()) {
      const nextMessage = "Branch is required."
      showResultDialog("error", nextMessage)
      return
    }

    if (!department.trim()) {
      const nextMessage = "Department is required."
      showResultDialog("error", nextMessage)
      return
    }

    if (!notes.trim()) {
      const nextMessage = "Reason is required."
      showResultDialog("error", nextMessage)
      return
    }

    if (assignmentType === "loan" && !expectedReturnDate) {
      const nextMessage = "Expected return date is required for loan requests."
      showResultDialog("error", nextMessage)
      return
    }

    if (!user?.id) {
      const nextMessage = "Session expired. Please login again."
      showResultDialog("error", nextMessage)
      return
    }

    const composedNotes = `[Branch:${branch.trim()}] ${notes.trim()}`

    try {
      await createConsumableRequestApi({
        itemName,
        quantity: DEFAULT_REQUEST_QUANTITY,
        assignment_type: assignmentType,
        department,
        notes: composedNotes,
        employee_id: user.id,
        expected_return_date: assignmentType === "loan" ? expectedReturnDate : null,
      })
      setItemName("")
      setAssignmentType("")
      setExpectedReturnDate("")
      setBranch("")
      setDepartment("")
      setNotes("")
      const refreshed = await getConsumableRequestsApi(user?.id)
      setRequests(refreshed)
      const successMessage = "Request submitted successfully."
      showResultDialog("success", successMessage)
    } catch (submitError) {
      const nextMessage = submitError instanceof Error ? submitError.message : "Failed to submit request."
      showResultDialog("error", nextMessage)
    }
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto grid w-full max-w-[920px] grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setActiveView("request")}
          className={getInterfaceTileClassName(
            activeView === "request",
            "w-full px-5 py-3"
          )}
        >
          <p className={getInterfaceTileTitleClassName(activeView === "request", "text-base")}>
            Request Consumable
          </p>
          <p className={getInterfaceTileDescriptionClassName(activeView === "request", "mt-1 text-xs leading-5")}>
            Submit a new request.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setActiveView("history")}
          className={getInterfaceTileClassName(
            activeView === "history",
            "w-full px-5 py-3"
          )}
        >
          <p className={getInterfaceTileTitleClassName(activeView === "history", "text-base")}>
            My Consumable Requests
          </p>
          <p className={getInterfaceTileDescriptionClassName(activeView === "history", "mt-1 text-xs leading-5")}>
            Track decisions.
          </p>
        </button>
      </div>

      {activeView === "request" ? (
        <Card className="mx-auto w-full max-w-[760px] rounded-lg border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="border-b border-slate-200 px-4 py-3">
            <CardTitle className="text-lg font-semibold text-slate-900">Request Consumable</CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-4">
            <form className="mx-auto w-full max-w-[560px] space-y-4" onSubmit={handleSubmit} autoComplete="off">
                <div className="space-y-1.5">
                  <label htmlFor="item-name" className="text-sm font-semibold text-slate-900">
                    Item
                  </label>
                  <select
                    id="item-name"
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    value={itemName}
                    onChange={(event) => setItemName(event.target.value)}
                    disabled={loadingStock || itemOptions.every((option) => option.disabled)}
                  >
                    <option value="" disabled>
                      Select item
                    </option>
                    {itemOptions.map((option) => (
                      <option key={option.key} value={option.value} disabled={option.disabled}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="assignment-type" className="text-sm font-semibold text-slate-900">
                    Assignment Type
                  </label>
                  <select
                    id="assignment-type"
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    value={assignmentType}
                    onChange={(event) => {
                      const nextType = event.target.value as "" | "new" | "loan" | "exchange"
                      setAssignmentType(nextType)
                      if (nextType !== "loan") {
                        setExpectedReturnDate("")
                      }
                    }}
                  >
                    <option value="" disabled>
                      Select type
                    </option>
                    <option value="new">New</option>
                    <option value="loan">Loan</option>
                    <option value="exchange">Exchange</option>
                  </select>
                </div>

              {assignmentType ? (
                <>
                  {assignmentType === "loan" ? (
                    <div className="space-y-1.5">
                      <label htmlFor="expected-return-date" className="text-sm font-semibold text-slate-900">
                        Expected Return Date
                      </label>
                      <input
                        id="expected-return-date"
                        type="date"
                        value={expectedReturnDate}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(event) => setExpectedReturnDate(event.target.value)}
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <label htmlFor="department" className="text-sm font-semibold text-slate-900">
                      Department
                    </label>
                    <select
                      id="department"
                      value={department}
                      onChange={(event) => setDepartment(event.target.value)}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="">Select department</option>
                      {DEPARTMENT_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="branch" className="text-sm font-semibold text-slate-900">
                      Branch
                    </label>
                    <select
                      id="branch"
                      value={branch}
                      onChange={(event) => setBranch(event.target.value)}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="">Select branch</option>
                      {BRANCH_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="notes" className="text-sm font-semibold text-slate-900">
                      Reason
                    </label>
                    <textarea
                      id="notes"
                      className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Why do you need this consumable?"
                    />
                  </div>
                </>
              ) : null}

              <div className="flex justify-end">
                <Button
                  className="h-10 w-full rounded-md bg-[#0072CE] text-sm font-semibold text-white hover:bg-[#005DA8] sm:w-44"
                  type="submit"
                >
                  Submit Request
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {activeView === "history" ? (
        <Card className="mx-auto w-full max-w-[1200px] rounded-lg border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="border-b border-[#0072CE]/15 px-4 py-2.5">
            <CardTitle className="text-base font-semibold text-[#0B1F3A]">My Consumable Requests</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[30%] px-6 text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Item</TableHead>
                  <TableHead className="w-[8%] text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Qty</TableHead>
                  <TableHead className="w-[14%] text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Type</TableHead>
                  <TableHead className="w-[18%] text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Return Date</TableHead>
                  <TableHead className="w-[15%] text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Status</TableHead>
                  <TableHead className="w-[15%] text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="px-6 py-6 text-center text-sm text-[#1E3A6D]">
                      No requests submitted yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  myRequests.map((request) => {
                    const decisionNote =
                      request.status === "approved"
                        ? `Approved by ${request.approvedBy ?? "Admin"}`
                        : request.status === "rejected"
                          ? `Rejected: ${request.rejectionReason ?? "No reason provided"}`
                          : "Awaiting admin decision"

                    return (
                      <TableRow key={request.id}>
                        <TableCell className="px-6 text-[#0B1F3A]">
                          <p className="truncate" title={toDisplayItemName(request.itemName)}>
                            {toDisplayItemName(request.itemName)}
                          </p>
                        </TableCell>
                        <TableCell className="text-[#0B1F3A]">{request.quantity}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-slate-300 bg-slate-50 text-[#0B1F3A] whitespace-nowrap">
                            {request.assignmentType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-[#0B1F3A]">
                          {request.expectedReturnDate ? new Date(request.expectedReturnDate).toLocaleDateString() : "N/A"}
                        </TableCell>
                        <TableCell className="text-xs text-[#0B1F3A]">
                          <Badge
                            variant="outline"
                            className={
                              request.status === "approved"
                                ? "border-[#007A3D]/30 bg-[#EAF8F0] text-[#007A3D]"
                                : request.status === "rejected"
                                  ? "border-[#D71920]/30 bg-[#FFEDEF] text-[#D71920]"
                                  : "border-[#0072CE]/30 bg-[#EAF3FF] text-[#0B1F3A]"
                            }
                          >
                            {request.status}
                          </Badge>
                          <p className="truncate" title={decisionNote}>
                            {decisionNote}
                          </p>
                        </TableCell>
                        <TableCell className="px-2">
                          {request.status === "approved" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 w-full border-[#0072CE]/35 px-2 text-xs text-[#0B1F3A] hover:bg-[#EAF3FF]"
                              onClick={() => router.push("/employee/my-consumables")}
                            >
                              Return
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-500">N/A</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <ActionFeedbackDialog
        open={resultDialog.open}
        status={resultDialog.status}
        message={resultDialog.message}
        onOk={handleDialogOk}
        secondaryActionLabel="Request Again"
        onSecondaryAction={handleRequestAgain}
      />
    </div>
  )
}
