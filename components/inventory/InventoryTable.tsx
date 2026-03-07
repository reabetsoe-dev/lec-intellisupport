"use client"

import { useEffect, useState } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getConsumables, type Consumable } from "@/lib/api"

export function InventoryTable() {
  const [items, setItems] = useState<Consumable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadItems = async () => {
    try {
      setError("")
      const data = await getConsumables()
      setItems(data)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load consumables.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadItems()
  }, [])

  const getStatus = (item: Consumable): string => {
    const explicitStatus = item.status ?? item.condition
    if (explicitStatus) {
      return explicitStatus
    }
    return item.quantity > 0 ? "In Stock" : "Out of Stock"
  }

  const getStatusClassName = (status: string): string => {
    const normalizedStatus = status.toLowerCase()
    if (normalizedStatus === "new" || normalizedStatus === "in stock") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    }
    if (normalizedStatus === "used") {
      return "border-amber-200 bg-amber-50 text-amber-700"
    }
    if (normalizedStatus === "damaged" || normalizedStatus === "out of stock") {
      return "border-rose-200 bg-rose-50 text-rose-700"
    }
    return "border-slate-200 bg-slate-50 text-slate-700"
  }

  return (
    <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 px-6 py-5">
        <CardTitle className="text-base font-semibold text-slate-900">Consumables Inventory</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-6 text-xs font-semibold tracking-wide text-slate-500 uppercase">Item Name</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Quantity</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="px-6 py-6 text-center text-sm text-slate-500">
                  Loading inventory...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={3} className="px-6 py-6 text-center text-sm text-rose-600">
                  {error}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="px-6 py-6 text-center text-sm text-slate-500">
                  No consumables found.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="px-6 font-medium text-slate-800">{item.item_name}</TableCell>
                  <TableCell className="text-slate-700">{item.quantity}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusClassName(getStatus(item))}>
                      {getStatus(item)}
                    </Badge>
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
