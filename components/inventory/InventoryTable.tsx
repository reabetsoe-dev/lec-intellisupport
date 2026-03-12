"use client"

import { useEffect, useState } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getConsumables, updateConsumable, type Consumable } from "@/lib/api"

export function InventoryTable() {
  const [items, setItems] = useState<Consumable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [savingId, setSavingId] = useState<number | null>(null)

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

  const updateQuantity = async (item: Consumable, delta: number) => {
    const current = item.quantity ?? 0
    const next = current + delta
    if (next < 0) {
      return
    }

    try {
      setSavingId(item.id)
      setError("")
      const updated = await updateConsumable(item.id, { quantity: next })
      setItems((currentItems) => currentItems.map((row) => (row.id === updated.id ? updated : row)))
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update quantity.")
    } finally {
      setSavingId(null)
    }
  }

  const getConditionClassName = (condition: string): string => {
    const normalized = condition.toLowerCase()
    if (normalized.includes("new")) {
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    }
    if (normalized.includes("refurb")) {
      return "border-amber-200 bg-amber-50 text-amber-700"
    }
    return "border-slate-200 bg-slate-50 text-slate-700"
  }

  return (
    <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 px-6 py-5">
        <CardTitle className="text-base font-semibold text-slate-900">Assets Inventory</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-6 text-xs font-semibold tracking-wide text-slate-500 uppercase">Asset Tag</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Category</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Type</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Brand / Model</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Serial</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Quantity</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Condition</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-slate-500">
                  Loading inventory...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-rose-600">
                  {error}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="px-6 py-6 text-center text-sm text-slate-500">
                  No assets found.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="px-6 font-medium text-slate-800">{item.asset_tag || "N/A"}</TableCell>
                  <TableCell className="text-slate-700">{item.category || "N/A"}</TableCell>
                  <TableCell className="text-slate-700">{item.subcategory || item.device_type || item.printer_type || "N/A"}</TableCell>
                  <TableCell className="text-slate-700">{item.brand || "N/A"} {item.model_number || ""}</TableCell>
                  <TableCell className="text-slate-700">{item.serial_number || "N/A"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 w-7 px-0"
                        disabled={savingId === item.id || (item.quantity ?? 0) <= 0}
                        onClick={() => void updateQuantity(item, -1)}
                      >
                        -
                      </Button>
                      <span className="min-w-8 text-center text-sm font-medium text-slate-800">{item.quantity ?? 0}</span>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 w-7 px-0"
                        disabled={savingId === item.id}
                        onClick={() => void updateQuantity(item, 1)}
                      >
                        +
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getConditionClassName(item.condition || "N/A")}>
                      {item.condition || "N/A"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-700">{item.purchase_cost !== undefined && item.purchase_cost !== null ? `M ${item.purchase_cost}` : "N/A"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
