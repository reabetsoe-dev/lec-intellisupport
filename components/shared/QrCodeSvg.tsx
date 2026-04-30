"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"

type QrCodeSvgProps = {
  value: string
  size?: number
  className?: string
}

export function QrCodeSvg({ value, size = 256, className }: QrCodeSvgProps) {
  const [svgMarkup, setSvgMarkup] = useState("")
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let isActive = true

    void QRCode.toString(value, {
      type: "svg",
      width: size,
      margin: 1,
      color: {
        dark: "#0B1F3A",
        light: "#FFFFFFFF",
      },
    })
      .then((markup) => {
        if (!isActive) {
          return
        }
        setHasError(false)
        setSvgMarkup(markup)
      })
      .catch(() => {
        if (!isActive) {
          return
        }
        setHasError(true)
        setSvgMarkup("")
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

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  )
}
