"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import {
  createConsumableRequest as createConsumableRequestApi,
  getConsumableRequests as getConsumableRequestsApi,
  getConsumables,
  type Consumable,
  type ConsumableRequest,
} from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const REFRESH_INTERVAL_MS = 15_000

function toDisplayItemName(value: string): string {
  return value
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ")
}

export function EmployeeConsumableRequestPanel() {
  const [activeView, setActiveView] = useState<"request" | "history" | null>(null)
  const [itemName, setItemName] = useState("")
  const [quantity, setQuantity] = useState("")
  const [assignmentType, setAssignmentType] = useState<"" | "new" | "loan" | "exchange">("")
  const [branch, setBranch] = useState("")
  const [department, setDepartment] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loadingStock, setLoadingStock] = useState(true)
  const [consumables, setConsumables] = useState<Consumable[]>([])
  const [requests, setRequests] = useState<ConsumableRequest[]>([])
  const router = useRouter()

  const user = getStoredUserSession()

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
          setError(loadError instanceof Error ? loadError.message : "Failed to load consumable stock.")
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
    setError("")
    setSuccess("")

    const parsedQuantity = Number(quantity)
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError("Quantity must be at least 1.")
      return
    }

    if (!itemName) {
      setError("No consumable item available.")
      return
    }
    if (!assignmentType) {
      setError("Please select assignment type (new, loan, or exchange).")
      return
    }

    if (!branch.trim()) {
      setError("Branch is required.")
      return
    }

    if (!department.trim()) {
      setError("Department is required.")
      return
    }

    if (!notes.trim()) {
      setError("Reason is required.")
      return
    }

    if (!user?.id) {
      setError("Session expired. Please login again.")
      return
    }

    const composedNotes = `[Branch:${branch.trim()}] ${notes.trim()}`

    try {
      await createConsumableRequestApi({
        itemName,
        quantity: parsedQuantity,
        assignment_type: assignmentType,
        department,
        notes: composedNotes,
        employee_id: user.id,
      })
      setItemName("")
      setQuantity("")
      setAssignmentType("")
      setBranch("")
      setDepartment("")
      setNotes("")
      const refreshed = await getConsumableRequestsApi(user?.id)
      setRequests(refreshed)
      setSuccess("Request submitted successfully. Redirecting to dashboard...")
      const dashboardPath = user.role === "technician" ? "/technician/dashboard" : "/employee/dashboard"
      window.setTimeout(() => {
        router.push(dashboardPath)
      }, 350)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit request.")
    }
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto grid w-full max-w-[860px] grid-cols-1 gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setActiveView("request")}
          className={
            activeView === "request"
              ? "rounded-xl border border-[#0072CE] bg-[#EAF3FF] px-4 py-3 text-left shadow-sm"
              : "rounded-xl border border-[#0072CE]/25 bg-white px-4 py-3 text-left shadow-sm transition hover:border-[#0072CE]/50 hover:bg-[#F5FAFF]"
          }
        >
          <p className="text-base font-semibold text-[#0B1F3A]">Request Consumable</p>
          <p className="mt-1 text-xs text-[#1E3A6D]">Open the request form to submit a new consumable request.</p>
        </button>
        <button
          type="button"
          onClick={() => setActiveView("history")}
          className={
            activeView === "history"
              ? "rounded-xl border border-[#0072CE] bg-[#EAF3FF] px-4 py-3 text-left shadow-sm"
              : "rounded-xl border border-[#0072CE]/25 bg-white px-4 py-3 text-left shadow-sm transition hover:border-[#0072CE]/50 hover:bg-[#F5FAFF]"
          }
        >
          <p className="text-base font-semibold text-[#0B1F3A]">My Consumable Requests</p>
          <p className="mt-1 text-xs text-[#1E3A6D]">View all your submitted requests and approval decisions.</p>
        </button>
      </div>

      {activeView === "request" ? (
        <Card className="mx-auto w-full max-w-[760px] rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="border-b border-[#0072CE]/15 px-4 py-2.5">
            <CardTitle className="text-sm font-semibold text-[#0B1F3A]">Request Consumable</CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-2.5">
            <form className="mx-auto w-full max-w-[650px] space-y-2" onSubmit={handleSubmit} autoComplete="off">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="department" className="text-xs font-semibold text-[#0B1F3A]">
                    Department
                  </label>
                  <Input
                    id="department"
                    value={department}
                    onChange={(event) => setDepartment(event.target.value)}
                    placeholder="Enter department"
                    autoComplete="off"
                    className="h-8 border-[#0072CE]/30 px-2.5 text-sm text-[#0B1F3A]"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="item-name" className="text-xs font-semibold text-[#0B1F3A]">
                    Item
                  </label>
                  <select
                    id="item-name"
                    className="h-8 w-full rounded-lg border border-[#0072CE]/30 bg-white px-2.5 text-sm text-[#0B1F3A]"
                    value={itemName}
                    onChange={(event) => setItemName(event.target.value)}
                    disabled={loadingStock || consumables.length === 0}
                  >
                    <option value="" disabled>
                      Select item
                    </option>
                    {consumables.map((item) => (
                      <option key={item.id} value={item.item_name}>
                        {toDisplayItemName(item.item_name)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="quantity" className="text-xs font-semibold text-[#0B1F3A]">
                    Quantity
                  </label>
                  <Input
                    id="quantity"
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    placeholder="Enter quantity"
                    autoComplete="off"
                    className="h-8 border-[#0072CE]/30 px-2.5 text-sm text-[#0B1F3A]"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="assignment-type" className="text-xs font-semibold text-[#0B1F3A]">
                    Assignment Type
                  </label>
                  <select
                    id="assignment-type"
                    className="h-8 w-full rounded-lg border border-[#0072CE]/30 bg-white px-2.5 text-sm text-[#0B1F3A]"
                    value={assignmentType}
                    onChange={(event) => setAssignmentType(event.target.value as "" | "new" | "loan" | "exchange")}
                  >
                    <option value="" disabled>
                      Select type
                    </option>
                    <option value="new">New</option>
                    <option value="loan">Loan</option>
                    <option value="exchange">Exchange</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="branch" className="text-xs font-semibold text-[#0B1F3A]">
                    Branch
                  </label>
                  <Input
                    id="branch"
                    value={branch}
                    onChange={(event) => setBranch(event.target.value)}
                    placeholder="Enter branch"
                    autoComplete="off"
                    className="h-8 border-[#0072CE]/30 px-2.5 text-sm text-[#0B1F3A]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="notes" className="text-xs font-semibold text-[#0B1F3A]">
                  Reason
                </label>
                <textarea
                  id="notes"
                  className="min-h-14 w-full rounded-lg border border-[#0072CE]/30 px-2.5 py-1.5 text-sm text-[#0B1F3A]"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Why do you need this consumable?"
                />
              </div>

              {error ? <p className="text-sm font-medium text-[#D71920]">{error}</p> : null}
              {success ? <p className="text-sm font-medium text-[#007A3D]">{success}</p> : null}

              <div className="flex justify-center">
                <Button
                  className="h-9 w-44 rounded-lg bg-[#0072CE] text-sm font-semibold text-white hover:bg-[#005DA8]"
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
        <Card className="mx-auto w-full max-w-[1200px] rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
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
                  <TableHead className="w-[33%] text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Status</TableHead>
                  <TableHead className="w-[15%] text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="px-6 py-6 text-center text-sm text-[#1E3A6D]">
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
    </div>
  )
}
