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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function extractRequestDetails(notes: string): { branch: string; reason: string } {
  const match = notes.match(/^\[Branch:(.+?)\]\s*(.*)$/i)
  if (!match) {
    return {
      branch: "N/A",
      reason: notes.trim() || "N/A",
    }
  }

  return {
    branch: match[1]?.trim() || "N/A",
    reason: match[2]?.trim() || "N/A",
  }
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

export function EmployeeConsumableRequestPanel() {
  const [activeView, setActiveView] = useState<"request" | "history" | null>(null)
  const [itemName, setItemName] = useState("")
  const [quantity, setQuantity] = useState("")
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
    const run = async () => {
      try {
        const [inventoryData, requestData] = await Promise.all([
          getConsumables(),
          getConsumableRequestsApi(user?.id),
        ])
        setConsumables(inventoryData)
        setRequests(requestData)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load consumable stock.")
      } finally {
        setLoadingStock(false)
      }
    }

    void run()
  }, [user?.id])

  const selectedConsumable = useMemo(
    () => consumables.find((item) => normalizeItemName(item.item_name) === normalizeItemName(itemName)),
    [consumables, itemName]
  )

  const availableStock = selectedConsumable?.quantity ?? 0
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

    if (parsedQuantity > availableStock) {
      setError(`Only ${availableStock} ${itemName} in stock. Reduce quantity or choose another item.`)
      return
    }

    const composedNotes = `[Branch:${branch.trim()}] ${notes.trim()}`

    try {
      await createConsumableRequestApi({
        itemName,
        quantity: parsedQuantity,
        department,
        notes: composedNotes,
        employee_id: user.id,
      })
      setItemName("")
      setQuantity("")
      setBranch("")
      setDepartment("")
      setNotes("")
      const refreshed = await getConsumableRequestsApi(user?.id)
      setRequests(refreshed)
      setSuccess("Request submitted successfully. Redirecting to dashboard...")
      window.setTimeout(() => {
        router.push("/employee/dashboard")
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
                  <p className="text-[10px] text-[#1E3A6D]">Current available stock: {availableStock}</p>
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
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-6 text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">ID</TableHead>
                  <TableHead className="min-w-[140px] text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Item</TableHead>
                  <TableHead className="min-w-[70px] text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Qty</TableHead>
                  <TableHead className="min-w-[130px] text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Branch</TableHead>
                  <TableHead className="min-w-[170px] text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Reason</TableHead>
                  <TableHead className="min-w-[100px] text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Status</TableHead>
                  <TableHead className="min-w-[220px] text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Decision Notes</TableHead>
                  <TableHead className="min-w-[180px] text-xs font-semibold tracking-wide text-[#1E3A6D] uppercase">Requested At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-[#1E3A6D]">
                      No requests submitted yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  myRequests.map((request) => {
                    const requestDetails = extractRequestDetails(request.notes)

                    return (
                      <TableRow key={request.id}>
                        <TableCell className="px-6 font-medium text-[#0B1F3A]">{request.id}</TableCell>
                      <TableCell className="text-[#0B1F3A]">{toDisplayItemName(request.itemName)}</TableCell>
                      <TableCell className="text-[#0B1F3A]">{request.quantity}</TableCell>
                      <TableCell className="text-[#0B1F3A]">{requestDetails.branch}</TableCell>
                      <TableCell className="max-w-[220px] text-xs text-[#0B1F3A]">{requestDetails.reason}</TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="max-w-[260px] text-xs text-[#0B1F3A]">
                        {request.status === "approved"
                          ? `Approved by ${request.approvedBy ?? "Admin"}`
                          : request.status === "rejected"
                              ? `Rejected: ${request.rejectionReason ?? "No reason provided"}`
                              : "Awaiting admin decision"}
                        </TableCell>
                        <TableCell className="text-[#0B1F3A]">{formatDate(request.requestedAt)}</TableCell>
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
