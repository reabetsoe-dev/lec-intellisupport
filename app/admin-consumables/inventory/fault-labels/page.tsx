"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Printer } from "lucide-react"
import { useSearchParams } from "next/navigation"

import { AssetQrImage } from "@/components/inventory/AssetQrImage"
import { QrPublicOriginControl } from "@/components/inventory/QrPublicOriginControl"
import { Button } from "@/components/ui/button"
import { getConsumables, type Consumable } from "@/lib/api"
import { buildAssetFaultReportPath, buildAssetFaultReportUrl, isLocalQrOrigin, resolveQrBaseOrigin } from "@/lib/asset-qr"
import { isFaultReportableConsumable, normalizeAssetCode } from "@/lib/assetQrAssets"

function getAssetType(asset: Consumable): string {
  return asset.subcategory || asset.device_type || asset.printer_type || asset.item_name || "N/A"
}

function getAssetName(asset: Consumable): string {
  return `${asset.brand || ""} ${asset.model_number || ""}`.trim() || asset.item_name || "N/A"
}

function FaultQrLabelsContent() {
  const searchParams = useSearchParams()
  const [assets, setAssets] = useState<Consumable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [origin, setOrigin] = useState("")
  const autoPrintRef = useRef(false)

  const assetIdParam = searchParams.get("assetId")
  const autoPrintEnabled = searchParams.get("autoprint") === "1"
  const qrOriginIsLocal = origin ? isLocalQrOrigin(origin) : true

  useEffect(() => {
    let active = true

    const loadOrigin = async () => {
      const nextOrigin = await resolveQrBaseOrigin()
      if (active) {
        setOrigin(nextOrigin)
      }
    }

    void loadOrigin()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    const loadAssets = async () => {
      try {
        setLoading(true)
        setError("")
        const response = await getConsumables()
        if (!active) {
          return
        }
        setAssets(response)
      } catch (loadError) {
        if (!active) {
          return
        }
        setError(loadError instanceof Error ? loadError.message : "Failed to load fault QR labels.")
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadAssets()
    return () => {
      active = false
    }
  }, [])

  const labelAssets = useMemo(() => {
    const parsedAssetId = assetIdParam ? Number.parseInt(assetIdParam, 10) : null
    const reportableAssets = assets.filter(isFaultReportableConsumable)
    if (parsedAssetId && Number.isInteger(parsedAssetId)) {
      return reportableAssets.filter((item) => item.id === parsedAssetId)
    }
    return reportableAssets
  }, [assetIdParam, assets])

  useEffect(() => {
    if (!autoPrintEnabled || autoPrintRef.current || loading || qrOriginIsLocal) {
      return
    }
    autoPrintRef.current = true
    const timer = window.setTimeout(() => {
      window.print()
    }, 420)
    return () => window.clearTimeout(timer)
  }, [autoPrintEnabled, loading, qrOriginIsLocal])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#EFF7FF,_#DEEFFF_45%,_#D7E9FF_100%)] px-6 py-6">
      <div className="mx-auto w-full max-w-[1500px] space-y-6">
        <div className="print:hidden rounded-3xl border border-[#AED0F1] bg-white/90 px-6 py-5 shadow-[0_12px_34px_-22px_rgba(6,45,88,0.55)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[30px] font-semibold text-[#052042]">Asset Fault QR Labels</h1>
              <p className="mt-1 text-[18px] text-[#25537F]">
                Second QR flow labels that open asset troubleshooting and fault reporting.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="border-[#76AEE3] bg-white text-[#0A2445]">
                <Link href="/admin-consumables/inventory">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Inventory
                </Link>
              </Button>
              <Button
                type="button"
                disabled={qrOriginIsLocal}
                onClick={() => {
                  autoPrintRef.current = true
                  window.print()
                }}
                className="bg-[#0072CE] text-white shadow-[0_10px_24px_-16px_rgba(0,84,170,0.9)]"
              >
                <Printer className="h-4 w-4" />
                Print Labels
              </Button>
            </div>
          </div>
        </div>

        {origin ? <QrPublicOriginControl origin={origin} onOriginChange={setOrigin} /> : null}

        {!origin ? (
          <p className="rounded-2xl border border-[#B2D2F1] bg-white/85 px-5 py-4 text-[#325D89]">Preparing QR base URL...</p>
        ) : loading ? (
          <p className="rounded-2xl border border-[#B2D2F1] bg-white/85 px-5 py-4 text-[#325D89]">Loading labels...</p>
        ) : error ? (
          <p className="rounded-2xl border border-[#EDB7B7] bg-[#FFF5F5] px-5 py-4 text-[#A83A3A]">{error}</p>
        ) : labelAssets.length === 0 ? (
          <p className="rounded-2xl border border-[#EDB7B7] bg-[#FFF5F5] px-5 py-4 text-[#A83A3A]">No assets available for label printing.</p>
        ) : qrOriginIsLocal ? (
          <p className="print:hidden rounded-2xl border border-[#EDB7B7] bg-[#FFF5F5] px-5 py-4 text-[#A83A3A]">
            Paste and apply the Cloudflare HTTPS URL before printing. Localhost QR labels are disabled.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-3 print:gap-2">
            {labelAssets.map((asset) => {
              const assetCode = normalizeAssetCode(asset.asset_tag || `AST-${asset.id}`)
              const relativePath = buildAssetFaultReportPath(assetCode)
              const absoluteUrl = buildAssetFaultReportUrl(origin, assetCode)

              return (
                <article
                  key={asset.id}
                  className="rounded-2xl border border-[#95BDE4] bg-white px-3 py-3 shadow-[0_14px_30px_-22px_rgba(7,49,90,0.55)] print:break-inside-avoid print:rounded-none print:border-[#D2DCE8] print:shadow-none"
                >
                  <h2 className="text-[16px] leading-tight font-semibold text-[#052042]">
                    {assetCode} - {getAssetName(asset)}
                  </h2>
                  <p className="mt-1 text-[13px] text-[#2B5A86]">{asset.category || "General"} - {getAssetType(asset)}</p>
                  <p className="mt-1 text-[12px] text-[#2B5A86]">Flow: Asset Fault Reporting QR</p>

                  <div className="mt-2 border-t border-[#CEE2F6] pt-2">
                    <div className="flex items-start gap-3">
                      <div className="w-[172px] shrink-0">
                        <AssetQrImage value={absoluteUrl} size={164} className="h-[172px] w-[172px]" />
                        <p className="mt-1 break-all text-[9px] leading-tight text-[#052042]">
                          <span className="font-semibold">Public URL:</span> {absoluteUrl}
                        </p>
                      </div>
                      <div className="space-y-1 text-[12px] text-[#1A436B]">
                        <p>
                          <span className="font-semibold text-[#052042]">Tag:</span> {assetCode}
                        </p>
                        <p>
                          <span className="font-semibold text-[#052042]">Serial:</span> {asset.serial_number || "N/A"}
                        </p>
                        <p>
                          <span className="font-semibold text-[#052042]">Condition:</span> {asset.condition || "N/A"}
                        </p>
                        <p>
                          <span className="font-semibold text-[#052042]">Status:</span> {asset.status || "Active"}
                        </p>
                        <p className="break-all">
                          <span className="font-semibold text-[#052042]">Public URL:</span> {absoluteUrl}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 break-all text-[11px] text-[#345B7E]">
                      <span className="font-semibold text-[#052042]">QR encodes:</span> {absoluteUrl}
                    </p>
                    <p className="mt-1 text-[11px] text-[#45688B]">Relative path: {relativePath}</p>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function FaultQrLabelsPage() {
  return (
    <Suspense fallback={null}>
      <FaultQrLabelsContent />
    </Suspense>
  )
}
