"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"

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

export function EmployeeConsumableRequestPanel() {
  const [itemName, setItemName] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [department, setDepartment] = useState("Finance")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loadingStock, setLoadingStock] = useState(true)
  const [consumables, setConsumables] = useState<Consumable[]>([])
  const [requests, setRequests] = useState<ConsumableRequest[]>([])

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
        setItemName((current) => (current || inventoryData[0]?.item_name || ""))
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
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

    if (!user?.id) {
      setError("Session expired. Please login again.")
      return
    }

    if (parsedQuantity > availableStock) {
      setError(`Only ${availableStock} ${itemName} in stock. Reduce quantity or choose another item.`)
      return
    }

    createConsumableRequestApi({
      itemName,
      quantity: parsedQuantity,
      department,
      notes,
      employee_id: user.id,
    })
      .then(async () => {
        setQuantity("1")
        setNotes("")
        const refreshed = await getConsumableRequestsApi(user?.id)
        setRequests(refreshed)
        setSuccess("Request submitted successfully.")
      })
      .catch((submitError) => {
        setError(submitError instanceof Error ? submitError.message : "Failed to submit request.")
      })
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">Apply for Consumables</CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-6">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="item-name" className="text-sm font-medium text-slate-700">
                Item
              </label>
              <select
                id="item-name"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
                disabled={loadingStock || consumables.length === 0}
              >
                {consumables.map((item) => (
                  <option key={item.id} value={item.item_name}>
                    {toDisplayItemName(item.item_name)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">Current available stock: {availableStock}</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="quantity" className="text-sm font-medium text-slate-700">
                Quantity
              </label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="department" className="text-sm font-medium text-slate-700">
                Department
              </label>
              <Input id="department" value={department} onChange={(event) => setDepartment(event.target.value)} />
            </div>

            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-medium text-slate-700">
                Reason
              </label>
              <textarea
                id="notes"
                className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Why do you need this consumable?"
              />
            </div>

            {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
            {success ? <p className="text-sm font-medium text-emerald-700">{success}</p> : null}

            <Button className="w-full bg-slate-900 text-white hover:bg-slate-800" type="submit">
              Submit Request
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">My Consumable Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-6 text-xs font-semibold tracking-wide text-slate-500 uppercase">ID</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Item</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Qty</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Status</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Decision Notes</TableHead>
                <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Requested At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500">
                    No requests submitted yet.
                  </TableCell>
                </TableRow>
              ) : (
                myRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="px-6 font-medium text-slate-800">{request.id}</TableCell>
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
                    <TableCell className="text-xs text-slate-700">
                      {request.status === "approved"
                        ? `Approved by ${request.approvedBy ?? "Admin"}`
                        : request.status === "rejected"
                          ? `Rejected: ${request.rejectionReason ?? "No reason provided"}`
                          : "Awaiting admin decision"}
                    </TableCell>
                    <TableCell className="text-slate-700">{formatDate(request.requestedAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
