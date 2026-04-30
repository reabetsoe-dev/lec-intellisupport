"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Printer, SquareArrowOutUpRight } from "lucide-react"
import QRCode from "qrcode"

import { AssetQrImage } from "@/components/inventory/AssetQrImage"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getConsumables, type Consumable } from "@/lib/api"
import { buildAssetScanPath, buildAssetScanToken, buildAssetScanUrl, getClientOrigin } from "@/lib/asset-qr"

const REFRESH_INTERVAL_MS = 15_000

export function InventoryTable() {
  const [items, setItems] = useState<Consumable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const totalStock = useMemo(
    () => items.reduce((runningTotal, item) => runningTotal + (item.quantity ?? 0), 0),
    [items]
  )

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
    const intervalId = window.setInterval(() => {
      void loadItems()
    }, REFRESH_INTERVAL_MS)
    const onFocus = () => {
      void loadItems()
    }
    window.addEventListener("focus", onFocus)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
    }
  }, [])

  const getConditionClassName = (condition: string): string => {
    const normalized = condition.toLowerCase()
    if (normalized.includes("new")) {
      return "border-emerald-300/70 bg-emerald-100/80 text-emerald-900"
    }
    if (normalized.includes("refurb")) {
      return "border-amber-300/80 bg-amber-100/85 text-amber-900"
    }
    if (normalized.includes("fault") || normalized.includes("damag")) {
      return "border-rose-300/80 bg-rose-100/85 text-rose-800"
    }
    return "border-sky-300/70 bg-sky-100/80 text-sky-900"
  }

  const getCategoryClassName = (value: string): string => {
    const normalized = value.toLowerCase()
    if (normalized.includes("computer")) {
      return "border-indigo-300/70 bg-indigo-100/80 text-indigo-900"
    }
    if (normalized.includes("gadget")) {
      return "border-cyan-300/70 bg-cyan-100/80 text-cyan-900"
    }
    if (normalized.includes("printer")) {
      return "border-fuchsia-300/70 bg-fuchsia-100/80 text-fuchsia-900"
    }
    return "border-slate-300/70 bg-slate-100/85 text-slate-900"
  }

  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")

  const openQrPrintDialog = async (assetId?: number) => {
    const selectedItems = typeof assetId === "number" ? items.filter((item) => item.id === assetId) : items
    if (selectedItems.length === 0) {
      return
    }

    const printWindow = window.open("", "_blank", "width=1100,height=900")
    if (!printWindow) {
      const queryParams = new URLSearchParams({ autoprint: "1" })
      if (typeof assetId === "number") {
        queryParams.set("assetId", String(assetId))
      }
      window.location.assign(`/admin-consumables/inventory/labels?${queryParams.toString()}`)
      return
    }

    printWindow.document.open()
    printWindow.document.write(
      "<!doctype html><html><head><title>Preparing QR labels...</title></head><body style='font-family:Arial,sans-serif;padding:20px'>Preparing QR labels...</body></html>"
    )
    printWindow.document.close()

    const origin = getClientOrigin()
    const rows = await Promise.all(
      selectedItems.map(async (item) => {
        const token = buildAssetScanToken(item.id)
        const qrUrl = buildAssetScanUrl(origin, token)
        const dataUrl = await QRCode.toDataURL(qrUrl, {
          width: 300,
          margin: 1,
          color: {
            dark: "#000000",
            light: "#FFFFFF",
          },
          errorCorrectionLevel: "M",
        })
        return {
          label: item.asset_tag || `AST-${item.id}`,
          dataUrl,
        }
      })
    )

    const cardsHtml = rows
      .map(
        (row) =>
          `<article class="qr-card"><img src="${row.dataUrl}" alt="QR code"/><p>${escapeHtml(row.label)}</p></article>`
      )
      .join("")

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Asset QR Labels</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 12px; color: #111827; }
      .qr-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .qr-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; align-items: center; page-break-inside: avoid; break-inside: avoid; }
      .qr-card img { width: 220px; height: 220px; object-fit: contain; image-rendering: pixelated; }
      .qr-card p { margin: 6px 0 0; font-size: 12px; font-weight: 700; text-align: center; }
      @media print {
        body { margin: 8mm; }
        .qr-grid { gap: 8px; }
      }
    </style>
  </head>
  <body>
    <section class="qr-grid">${cardsHtml}</section>
    <script>
      window.onload = function () {
        setTimeout(function () {
          window.print();
        }, 120);
      };
      window.onafterprint = function () {
        window.close();
      };
    </script>
  </body>
</html>`

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }

  const origin = getClientOrigin()

  return (
    <Card className="relative overflow-hidden rounded-2xl border border-[#97C3EA]/55 bg-[radial-gradient(circle_at_top_right,_#F8FCFF_0%,_#EAF5FF_42%,_#E3F0FF_100%)] py-0 shadow-[0_30px_70px_-48px_rgba(6,49,92,0.92)]">
      <div className="pointer-events-none absolute -top-28 -right-20 h-80 w-80 rounded-full bg-[#60AEFF]/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-[#1E75CA]/10 blur-3xl" />

      <CardHeader className="relative flex flex-wrap items-center justify-between gap-4 border-b border-[#BBD4EB] bg-white/70 px-6 py-5 backdrop-blur">
        <div className="space-y-1">
          <CardTitle className="text-xl font-semibold text-[#06264A]">Assets Inventory</CardTitle>
          <p className="text-sm text-[#36628E]">Smart inventory register with QR actions and instant label printing.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-[#99C5EA] bg-[#EAF5FF] px-3 py-1 text-xs font-semibold text-[#1B4974]">
            {loading ? "Loading..." : `${items.length} Assets`}
          </span>
          <span className="inline-flex rounded-full border border-[#99C5EA] bg-[#EAF5FF] px-3 py-1 text-xs font-semibold text-[#1B4974]">
            {loading ? "..." : `${totalStock} Units`}
          </span>
          <Button
            type="button"
            variant="outline"
            className="border-[#63A6E6] bg-white text-[#0A2445] shadow-[0_12px_26px_-20px_rgba(22,89,154,0.9)]"
            onClick={() => void openQrPrintDialog()}
          >
            <Printer className="h-4 w-4" />
            Print QR Labels
          </Button>
          <Button asChild variant="outline" className="border-[#63A6E6] bg-white text-[#0A2445]">
            <Link href="/admin-consumables/inventory/fault-labels">
              <SquareArrowOutUpRight className="h-4 w-4" />
              Fault QR Labels
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="relative overflow-x-auto p-0">
        <Table>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="border-y-0 bg-gradient-to-r from-[#0E4579] via-[#1A5D96] to-[#2F79B0] hover:bg-gradient-to-r">
              <TableHead className="px-6 text-[11px] font-semibold tracking-[0.08em] text-white uppercase">Asset Tag</TableHead>
              <TableHead className="text-[11px] font-semibold tracking-[0.08em] text-white uppercase">Category</TableHead>
              <TableHead className="text-[11px] font-semibold tracking-[0.08em] text-white uppercase">Type</TableHead>
              <TableHead className="text-[11px] font-semibold tracking-[0.08em] text-white uppercase">Brand / Model</TableHead>
              <TableHead className="text-[11px] font-semibold tracking-[0.08em] text-white uppercase">Serial</TableHead>
              <TableHead className="text-[11px] font-semibold tracking-[0.08em] text-white uppercase">Quantity</TableHead>
              <TableHead className="text-[11px] font-semibold tracking-[0.08em] text-white uppercase">Condition</TableHead>
              <TableHead className="text-[11px] font-semibold tracking-[0.08em] text-white uppercase">Cost</TableHead>
              <TableHead className="pr-6 text-[11px] font-semibold tracking-[0.08em] text-white uppercase">QR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="px-6 py-7 text-center text-sm text-[#4E7398]">
                  Loading inventory...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={9} className="px-6 py-7 text-center text-sm text-[#B42318]">
                  {error}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="px-6 py-7 text-center text-sm text-[#4E7398]">
                  No assets found.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, index) => {
                const token = buildAssetScanToken(item.id)
                const scanPath = buildAssetScanPath(token)
                const absoluteScanUrl = buildAssetScanUrl(origin, token)
                const categoryLabel = item.category || item.department || "N/A"
                const typeLabel = item.subcategory || item.device_type || item.printer_type || item.item_name || "N/A"
                const quantityValue = item.quantity ?? 0
                return (
                  <TableRow
                    key={item.id}
                    className={`group border-b border-[#C7DDF2] align-top transition-all duration-200 ${
                      index % 2 === 0 ? "bg-white/80" : "bg-[#F2F8FF]/90"
                    } hover:bg-[#EAF4FF]`}
                  >
                    <TableCell className="px-6 py-4">
                      <div className="space-y-1">
                        <p className="font-semibold text-[#0C3D69]">{item.asset_tag || "N/A"}</p>
                        <p className="text-xs text-[#5B7EA1]">ID #{item.id}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getCategoryClassName(categoryLabel)}`}>
                        {categoryLabel}
                      </span>
                    </TableCell>
                    <TableCell className="py-4">
                      <span className="inline-flex rounded-full border border-[#B9D4EB] bg-[#EDF6FF] px-3 py-1 text-xs font-semibold text-[#1D4A74]">
                        {typeLabel}
                      </span>
                    </TableCell>
                    <TableCell className="py-4 text-[#204B72]">
                      <span className="font-medium">{`${item.brand || ""} ${item.model_number || ""}`.trim() || item.item_name || "N/A"}</span>
                    </TableCell>
                    <TableCell className="py-4 font-mono text-sm text-[#264E73]">{item.serial_number || "N/A"}</TableCell>
                    <TableCell className="py-4">
                      <span
                        className={`inline-flex min-w-[3rem] justify-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          quantityValue <= 5
                            ? "border-rose-300/80 bg-rose-100/85 text-rose-800"
                            : "border-cyan-300/70 bg-cyan-100/80 text-cyan-900"
                        }`}
                      >
                        {quantityValue}
                      </span>
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge variant="outline" className={getConditionClassName(item.condition || "N/A")}>
                        {item.condition || "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4">
                      <span className="font-semibold text-[#0E416E]">
                        {item.purchase_cost !== undefined && item.purchase_cost !== null ? `M ${item.purchase_cost}` : "N/A"}
                      </span>
                    </TableCell>
                    <TableCell className="py-4 pr-6">
                      <div className="w-fit rounded-2xl border border-[#A6CAE8] bg-white/95 p-2 shadow-[0_16px_32px_-22px_rgba(16,79,138,0.8)]">
                        <AssetQrImage
                          value={absoluteScanUrl}
                          size={112}
                          className="h-[118px] w-[118px] rounded-xl border border-[#9FC5E7] bg-white"
                        />
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Button asChild size="sm" variant="outline" className="h-8 w-full border-[#72AFE6] bg-white text-[#0A2445]">
                            <Link href={scanPath} target="_blank" rel="noreferrer">
                              <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                              Open
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 w-full border-[#72AFE6] bg-white text-[#0A2445]"
                            onClick={() => void openQrPrintDialog(item.id)}
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Print
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
