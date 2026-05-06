"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"

type QrCodeSvgProps = {
  value: string
  size?: number
  className?: string
}

export function QrCodeSvg({ value, size = 256, className }: QrCodeSvgProps) { // Generation of QR code
  const [qrDataUrl, setQrDataUrl] = useState("")
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let isActive = true

    setQrDataUrl("")

    void QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "H",
      color: {
        dark: "#0B1F3A",
        light: "#FFFFFF",
      },
    })
      .then((dataUrl) => {
        if (!isActive) {
          return
        }
        setHasError(false)
        setQrDataUrl(dataUrl)
      })
      .catch(() => {
        if (!isActive) {
          return
        }
        setHasError(true)
        setQrDataUrl("")
      })

    return () => {
      isActive = false
    }
  }, [size, value])

  if (hasError) {
    return (
      <div className={className}>
        <div className="flex min-h-[12rem] items-center justify-center rounded-2xl border border-dashed border-[#9CB9D5] bg-white px-6 text-center text-sm text-[#4F6F95]">
          Unable to generate QR code right now.
        </div>
      </div>
    )
  }

  if (!qrDataUrl) {
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
      <img
        src={qrDataUrl}
        alt="Technician access QR code"
        width={size}
        height={size}
        className="mx-auto block h-auto w-full max-w-full"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  )
}
