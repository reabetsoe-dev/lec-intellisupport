"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import QRCode from "qrcode"

import { cn } from "@/lib/utils"

type AssetQrImageProps = {
  value: string
  size?: number
  className?: string
  imageClassName?: string
}

export function AssetQrImage({ value, size = 176, className, imageClassName }: AssetQrImageProps) {
  const [dataUrl, setDataUrl] = useState<string>("")
  const [error, setError] = useState<string>("")

  useEffect(() => {
    let active = true

    const renderQr = async () => {
      try {
        setError("")
        setDataUrl("")
        const nextDataUrl = await QRCode.toDataURL(value, {
          width: size,
          margin: 1,
          color: {
            dark: "#0B1F3A",
            light: "#FFFFFF",
          },
          errorCorrectionLevel: "M",
        })
        if (!active) {
          return
        }
        setDataUrl(nextDataUrl)
      } catch {
        if (!active) {
          return
        }
        setError("QR unavailable")
      }
    }

    void renderQr()

    return () => {
      active = false
    }
  }, [size, value])

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-[#E6B7B7] bg-[#FFF5F5] px-3 py-2 text-xs text-[#A12727]",
          className
        )}
      >
        {error}
      </div>
    )
  }

  if (!dataUrl) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-dashed border-[#9CC4EA] bg-[#F5FAFF] px-3 py-2 text-xs text-[#3D6894]",
          className
        )}
      >
        Generating...
      </div>
    )
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-[#A3C7EA] bg-white p-2", className)}>
      <Image
        src={dataUrl}
        alt="Asset QR code"
        className={cn("h-auto w-full", imageClassName)}
        width={size}
        height={size}
        unoptimized
      />
    </div>
  )
}
