"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Printer, SquareArrowOutUpRight } from "lucide-react"
import QRCode from "qrcode"

import { AssetQrImage } from "@/components/inventory/AssetQrImage"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getConsumables, type Consumable } from "@/lib/api"
import { buildAssetScanToken, buildAssetScanUrl, getClientOrigin } from "@/lib/asset-qr"
import { getInventoryAssetFamilyLabel, isSupportedInventoryAsset } from "@/lib/assetQrAssets"

const REFRESH_INTERVAL_MS = 15_000

function getCategoryLabel(item: Consumable): string {
  return item.category || item.department || "N/A"
}

function getSubtypeLabel(item: Consumable): string {
  return item.subcategory || item.device_type || item.item_name || "N/A"
}

function getFamilyClassName(value: string): string {
  if (value === "Computer") {
    return "border-[#9CB7F6] bg-[#EEF2FF] text-[#2F3A8F]"
  }
  if (value === "Mouse") {
    return "border-[#93D8C1] bg-[#DDF8EF] text-[#177F5A]"
  }
  if (value === "Keyboard") {
    return "border-[#F4D88D] bg-[#FFF5D8] text-[#8A5F00]"
  }
  return "border-[#9CD9EA] bg-[#E8FAFF] text-[#176A7D]"
}

function getConditionClassName(condition: string): string {
  const normalized = condition.toLowerCase()
  if (normalized.includes("new")) {
    return "border-[#9ED4B2] bg-[#ECF9F1] text-[#1E7A45]"
  }
  if (normalized.includes("refurb")) {
    return "border-[#D9C38D] bg-[#FFF7E5] text-[#8B5A12]"
  }
  if (normalized.includes("fault") || normalized.includes("damag")) {
    return "border-[#D9A2A2] bg-[#FFEAEA] text-[#A33C3C]"
  }
  return "border-[#9CC4EA] bg-[#DDEEFF] text-[#2E6092]"
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function InventoryTable() {
  const [items, setItems] = useState<Consumable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const supportedItems = useMemo(() => items.filter(isSupportedInventoryAsset), [items])
  const hiddenAssetCount = Math.max(0, items.length - supportedItems.length)

  const loadItems = async () => {
    try {
      setError("")
      const data = await getConsumables()
      setItems(data)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load assets.")
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

  const openQrPrintDialog = async (assetId?: number) => {
    const selectedItems =
      typeof assetId === "number" ? supportedItems.filter((item) => item.id === assetId) : supportedItems
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
    <Card className="rounded-xl border border-[#9CB8D3] bg-[#EDF3F9] py-0 shadow-sm">
      <CardHeader className="space-y-4 border-b border-[#B7CBE0] bg-[#E1EBF5] px-4 py-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#203B63]">Assets Inventory</h3>
              <p className="mt-1 text-xs text-[#5E7FA6]">Computer, mouse, keyboard, and gadget assets only</p>
            </div>
            <span className="text-xs text-[#5E7FA6]">Compact inventory table</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded border border-[#2D5A84] bg-[#163A5A] px-2 py-1 text-xs font-semibold text-white">
              {loading ? "Loading" : `${supportedItems.length} Assets`}
            </span>
            {hiddenAssetCount > 0 ? (
              <span className="inline-flex items-center rounded border border-[#C8B675] bg-[#FFF8E8] px-2 py-1 text-xs font-semibold text-[#8B5A12]">
                {hiddenAssetCount} unsupported hidden
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-[#93AECA] bg-white text-[#20466D]"
              onClick={() => void openQrPrintDialog()}
            >
              <Printer className="h-4 w-4" />
              Print QR Labels
            </Button>
            <Button asChild size="sm" variant="outline" className="border-[#93AECA] bg-white text-[#20466D]">
              <Link href="/admin-consumables/inventory/fault-labels">
                <SquareArrowOutUpRight className="h-4 w-4" />
                Fault QR Labels
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table className="table-fixed" containerClassName="overflow-x-hidden">
          <TableHeader>
            <TableRow className="border-y-0 bg-[#2E6EA0] hover:bg-[#2E6EA0]">
              <TableHead className="w-[19%] px-4 py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                Asset Tag
              </TableHead>
              <TableHead className="w-[15%] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                Type
              </TableHead>
              <TableHead className="w-[34%] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                Brand / Model / Serial
              </TableHead>
              <TableHead className="w-[12%] py-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                Condition
              </TableHead>
              <TableHead className="w-[20%] py-3 pr-3 text-[11px] font-semibold tracking-wide text-white uppercase">
                QR
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="px-6 py-6 text-center text-sm text-slate-500">
                  Loading inventory...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="px-6 py-6 text-center text-sm text-rose-600">
                  {error}
                </TableCell>
              </TableRow>
            ) : supportedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="px-6 py-8 text-center text-sm text-[#234A71]">
                  No supported assets found.
                </TableCell>
              </TableRow>
            ) : (
              supportedItems.map((item) => {
                const token = buildAssetScanToken(item.id)
                const absoluteScanUrl = buildAssetScanUrl(origin, token)
                const familyLabel = getInventoryAssetFamilyLabel(item)
                const subtypeLabel = getSubtypeLabel(item)
                const brandModel = `${item.brand || item.manufacturer || ""} ${item.model_number || item.brand_model || ""}`.trim()
                return (
                  <TableRow key={item.id} className="border-b border-[#C5D5E6] bg-[#F7FAFE] hover:bg-[#EAF2FA]">
                    <TableCell className="max-w-0 px-4 py-3">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-xs font-semibold text-[#2A5D8D] underline underline-offset-2">
                          {item.asset_tag || `AST-${item.id}`}
                        </p>
                        <p className="truncate text-[11px] text-[#5E7FA6]">ID #{item.id}</p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-0 py-3">
                      <div className="min-w-0 space-y-1">
                        <Badge
                          className={`rounded-sm border px-2 py-0.5 text-[11px] font-semibold ${getFamilyClassName(familyLabel)}`}
                        >
                          {familyLabel}
                        </Badge>
                        <p className="truncate text-[11px] text-[#5E7FA6]">{subtypeLabel}</p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-0 py-3">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-xs font-semibold text-[#1F4469]">
                          {brandModel || item.item_name || "N/A"}
                        </p>
                        <p className="truncate font-mono text-[11px] text-[#3D638C]">
                          Serial: {item.serial_number || "N/A"}
                        </p>
                        <p className="truncate text-[11px] text-[#5E7FA6]">{getCategoryLabel(item)}</p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-0 py-3">
                      <Badge
                        variant="outline"
                        className={`max-w-full rounded-sm border px-2 py-0.5 text-[11px] font-semibold ${getConditionClassName(item.condition || "N/A")}`}
                      >
                        <span className="truncate">{item.condition || "N/A"}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 pr-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="shrink-0 rounded-md border border-[#B8CFE6] bg-white p-1" title={absoluteScanUrl}>
                          <AssetQrImage value={absoluteScanUrl} size={42} className="h-[42px] w-[42px]" />
                        </div>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          aria-label={`Print QR label for ${item.asset_tag || `AST-${item.id}`}`}
                          title="Print QR label"
                          className="h-8 w-8 border-[#93AECA] bg-white text-[#20466D]"
                          onClick={() => void openQrPrintDialog(item.id)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
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
