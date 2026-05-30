"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import QRCode from "qrcode"

type QrCodeSvgProps = {
  value: string
  size?: number
  className?: string
}

export function QrCodeSvg({ value, size = 256, className }: QrCodeSvgProps) { // Generation of QR code
  const [qrCode, setQrCode] = useState({
    value: "",
    size: 0,
    dataUrl: "",
    hasError: false,
  })

  useEffect(() => {
    let isActive = true

    void QRCode.toDataURL(value, {
      width: size,
      margin: 4,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    })
      .then((dataUrl) => {
        if (!isActive) {
          return
        }
        setQrCode({
          value,
          size,
          dataUrl,
          hasError: false,
        })
      })
      .catch(() => {
        if (!isActive) {
          return
        }
        setQrCode({
          value,
          size,
          dataUrl: "",
          hasError: true,
        })
      })

    return () => {
      isActive = false
    }
  }, [size, value])

  const isStale = qrCode.value !== value || qrCode.size !== size

  if (!isStale && qrCode.hasError) {
    return (
      <div className={className}>
        <div className="flex min-h-[12rem] items-center justify-center rounded-2xl border border-dashed border-[#9CB9D5] bg-white px-6 text-center text-sm text-[#4F6F95]">
          Unable to generate QR code right now.
        </div>
      </div>
    )
  }

  if (isStale || !qrCode.dataUrl) {
    return (
      <div className={className}>
        <div className="flex min-h-[12rem] items-center justify-center rounded-2xl border border-dashed border-[#9CB9D5] bg-white px-6 text-center text-sm text-[#4F6F95]">
          Generating QR code...
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <Image
        src={qrCode.dataUrl}
        alt="Technician access QR code"
        width={size}
        height={size}
        unoptimized
        className="mx-auto block h-auto w-full max-w-full"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  )
}
