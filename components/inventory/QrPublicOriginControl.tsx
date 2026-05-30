"use client"

import { useEffect, useState } from "react"
import { Cloud, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  isLocalQrOrigin,
  normalizeQrOrigin,
  QR_PUBLIC_ORIGIN_STORAGE_KEY,
  resolveQrBaseOrigin,
} from "@/lib/asset-qr"

type QrPublicOriginControlProps = {
  origin: string
  onOriginChange: (origin: string) => void
}

export function QrPublicOriginControl({ origin, onOriginChange }: QrPublicOriginControlProps) {
  const [draftOrigin, setDraftOrigin] = useState(origin)
  const [error, setError] = useState("")
  const originIsLocal = origin ? isLocalQrOrigin(origin) : false

  useEffect(() => {
    setDraftOrigin(origin)
  }, [origin])

  const applyDraftOrigin = () => {
    const normalizedOrigin = normalizeQrOrigin(draftOrigin)
    if (!normalizedOrigin || !normalizedOrigin.startsWith("https://") || isLocalQrOrigin(normalizedOrigin)) {
      setError("Enter a valid Cloudflare HTTPS URL.")
      return
    }

    window.localStorage.setItem(QR_PUBLIC_ORIGIN_STORAGE_KEY, normalizedOrigin)
    onOriginChange(normalizedOrigin)
    setDraftOrigin(normalizedOrigin)
    setError("")
  }

  const resetOrigin = async () => {
    window.localStorage.removeItem(QR_PUBLIC_ORIGIN_STORAGE_KEY)
    setError("")
    const nextOrigin = await resolveQrBaseOrigin()
    onOriginChange(nextOrigin)
    setDraftOrigin(nextOrigin)
  }

  return (
    <div className="print:hidden rounded-2xl border border-[#B7D6EF] bg-white/85 px-4 py-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-2">
          <Label htmlFor="qr-public-origin" className="text-sm font-semibold text-[#0B1F3A]">
            QR public URL
          </Label>
          <Input
            id="qr-public-origin"
            value={draftOrigin}
            onChange={(event) => {
              setDraftOrigin(event.target.value)
              if (error) {
                setError("")
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyDraftOrigin()
              }
            }}
            className="h-10 border-[#76AEE3] bg-white text-[#0B1F3A]"
            placeholder="https://your-tunnel.trycloudflare.com"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={applyDraftOrigin} className="h-10 bg-[#0072CE] text-white hover:bg-[#005DA8]">
            <Cloud className="h-4 w-4" />
            Use URL
          </Button>
          <Button type="button" variant="outline" onClick={() => void resetOrigin()} className="h-10 border-[#76AEE3] bg-white text-[#0A2445]">
            <RotateCcw className="h-4 w-4" />
            Auto
          </Button>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-[#A83A3A]">{error}</p> : null}
      <p className={originIsLocal ? "mt-2 text-sm font-medium text-[#A83A3A]" : "mt-2 text-sm text-[#25537F]"}>
        {originIsLocal
          ? "Current QR labels are still local. Paste the Cloudflare tunnel URL before printing."
          : `Current QR labels use: ${origin}`}
      </p>
    </div>
  )
}
