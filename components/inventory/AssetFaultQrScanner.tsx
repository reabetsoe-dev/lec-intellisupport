"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import jsQR from "jsqr"
import { AlertCircle, Camera, ImageUp, Keyboard, Loader2, QrCode, ScanLine } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { buildAssetFaultReportPath } from "@/lib/asset-qr"

function getFaultReportPathFromScan(value: string): string | null {
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return null
  }

  try {
    const baseUrl = typeof window === "undefined" ? "http://127.0.0.1:3000" : window.location.origin
    const parsedUrl = new URL(trimmedValue, baseUrl)
    const segments = parsedUrl.pathname.split("/").filter(Boolean)
    const assetCode = segments[0] === "asset-qr" && segments[1] === "report" ? segments[2] : ""

    if (assetCode) {
      return buildAssetFaultReportPath(decodeURIComponent(assetCode))
    }
  } catch {
    return null
  }

  if (/^[A-Za-z0-9][A-Za-z0-9._-]{1,80}$/.test(trimmedValue)) {
    return buildAssetFaultReportPath(trimmedValue)
  }

  return null
}

async function decodeQrFromImageFile(file: File): Promise<string | null> {
  const imageUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error("Unable to load QR image."))
      element.src = imageUrl
    })

    const maxSide = 1600
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d", { willReadFrequently: true })

    if (!context) {
      return null
    }

    canvas.width = width
    canvas.height = height
    context.drawImage(image, 0, 0, width, height)

    const imageData = context.getImageData(0, 0, width, height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    })

    return code?.data ?? null
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

export function AssetFaultQrScanner() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const scanLockedRef = useRef(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [photoScanning, setPhotoScanning] = useState(false)
  const [scanError, setScanError] = useState("")
  const [manualAssetCode, setManualAssetCode] = useState("")

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setCameraReady(false)
    setCameraStarting(false)
  }, [])

  const openFaultReport = useCallback(
    (scanValue: string) => {
      const reportPath = getFaultReportPathFromScan(scanValue)
      if (!reportPath) {
        setScanError("This QR code is not an asset fault reporting code.")
        scanLockedRef.current = false
        return
      }

      scanLockedRef.current = true
      stopCamera()
      setScannerOpen(false)
      router.push(reportPath)
    },
    [router, stopCamera]
  )

  const scanFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d", { willReadFrequently: true })

    if (!video || !canvas || !context || scanLockedRef.current) {
      return
    }

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth",
      })

      if (code?.data) {
        openFaultReport(code.data)
        return
      }
    }

    animationFrameRef.current = window.requestAnimationFrame(scanFrame)
  }, [openFaultReport])

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError("Live camera scanning is blocked in this browser. Open the ngrok HTTPS link in Chrome/Safari, or use Scan from photo.")
      return
    }

    stopCamera()

    try {
      setCameraStarting(true)
      setScanError("")
      scanLockedRef.current = false

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream

      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCameraReady(true)
      animationFrameRef.current = window.requestAnimationFrame(scanFrame)
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera permission was blocked. Allow camera access or enter the asset code manually."
          : "Unable to start the camera. Enter the asset code manually or try again."
      setScanError(message)
    } finally {
      setCameraStarting(false)
    }
  }, [scanFrame, stopCamera])

  useEffect(() => {
    if (!scannerOpen) {
      stopCamera()
      return
    }

    void startCamera()

    return () => {
      stopCamera()
    }
  }, [scannerOpen, startCamera, stopCamera])

  const openScanner = () => {
    setScanError("")
    setScannerOpen(true)
  }

  const openManualAssetReport = () => {
    const reportPath = getFaultReportPathFromScan(manualAssetCode)
    if (!reportPath) {
      setScanError("Enter a valid asset code first.")
      return
    }

    router.push(reportPath)
  }

  const handleQrImageSelected = async (file: File | null) => {
    if (!file) {
      return
    }

    try {
      setPhotoScanning(true)
      setScanError("")

      const decodedValue = await decodeQrFromImageFile(file)
      if (!decodedValue) {
        setScanError("No QR code was found in that image. Try taking a clearer photo of the asset label.")
        return
      }

      openFaultReport(decodedValue)
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Unable to read that QR image.")
    } finally {
      setPhotoScanning(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  return (
    <>
      <Card className="mx-auto w-full max-w-[900px] rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#0072CE]/15 px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#0B1F3A]">
            <QrCode className="h-5 w-5 text-[#0072CE]" />
            Asset QR Fault Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="asset-code-manual" className="text-sm font-medium text-[#0B1F3A]">
                Asset code
              </Label>
              <Input
                id="asset-code-manual"
                value={manualAssetCode}
                onChange={(event) => setManualAssetCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    openManualAssetReport()
                  }
                }}
                className="h-10 border-[#0072CE]/30 text-[#0B1F3A]"
                placeholder="Example: AST-001"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:flex">
              <Button
                type="button"
                onClick={openScanner}
                className="h-10 rounded-lg border border-[#005DA8] bg-[#0072CE] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#005DA8]"
              >
                <Camera className="h-4 w-4" />
                Scan QR
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={photoScanning}
                className="h-10 rounded-lg border-[#0072CE]/30 bg-white px-5 text-sm font-semibold text-[#0B1F3A] hover:bg-[#F6FAFF]"
              >
                {photoScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
                Photo
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={openManualAssetReport}
                className="h-10 rounded-lg border-[#0072CE]/30 bg-white px-5 text-sm font-semibold text-[#0B1F3A] hover:bg-[#F6FAFF]"
              >
                <Keyboard className="h-4 w-4" />
                Open
              </Button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => void handleQrImageSelected(event.target.files?.[0] ?? null)}
          />

          {scanError ? (
            <div className="flex items-start gap-2 rounded-lg border border-[#EDB0B0] bg-[#FFEAEA] px-4 py-3 text-sm text-[#8A2D2D]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{scanError}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="max-h-[92vh] max-w-[520px] overflow-y-auto p-0">
          <DialogHeader className="border-b border-[#DCE8F5] px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-[#0B1F3A]">
              <ScanLine className="h-5 w-5 text-[#0072CE]" />
              Scan Asset QR
            </DialogTitle>
            <DialogDescription>Point the camera at the asset fault QR label.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-5">
            <div className="relative aspect-square overflow-hidden rounded-xl border border-[#9FC5EA] bg-[#06182D]">
              <video
                ref={videoRef}
                muted
                playsInline
                className="h-full w-full object-cover"
                aria-label="Asset QR scanner camera preview"
              />
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="h-[66%] w-[66%] rounded-2xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(6,24,45,0.36)]" />
              </div>
              {cameraStarting ? (
                <div className="absolute inset-0 grid place-items-center bg-[#06182D]/80 text-sm font-medium text-white">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting camera...
                  </span>
                </div>
              ) : null}
            </div>
            <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

            {cameraReady ? (
              <p className="rounded-lg border border-[#B7D6EF] bg-[#F6FAFF] px-4 py-3 text-sm text-[#1F4E7A]">
                Scanner is active.
              </p>
            ) : null}

            {scanError ? (
              <div className="flex items-start gap-2 rounded-lg border border-[#EDB0B0] bg-[#FFEAEA] px-4 py-3 text-sm text-[#8A2D2D]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{scanError}</span>
              </div>
            ) : null}

            <Button
              type="button"
              variant="outline"
              onClick={() => void startCamera()}
              disabled={cameraStarting}
              className="h-10 w-full rounded-lg border-[#0072CE]/30 bg-white text-[#0B1F3A] hover:bg-[#F6FAFF]"
            >
              <Camera className="h-4 w-4" />
              Try Camera Again
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoScanning}
              className="h-10 w-full rounded-lg border-[#0072CE]/30 bg-white text-[#0B1F3A] hover:bg-[#F6FAFF]"
            >
              {photoScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
              Scan from photo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
