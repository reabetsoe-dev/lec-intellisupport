"use client"

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import jsQR from "jsqr"
import { Camera, Loader2, QrCode, RotateCcw, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type ScannerStatus = "idle" | "starting" | "scanning" | "detected" | "error"

type AssetQrScannerDialogProps = {
  open: boolean
  resolving?: boolean
  resolveError?: string
  onOpenChange: (open: boolean) => void
  onQrCodeDetected: (value: string) => void
  onManualAssetCode: (assetCode: string) => void
}

function getCameraUnavailableMessage(): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Live camera scanning needs HTTPS or localhost. Use Take QR Photo below, or open the site with HTTPS."
  }
  return "This browser does not support live camera scanning. Use Take QR Photo below, or enter the asset code."
}

function getCameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ""

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission was denied. Allow camera access in the browser and try again."
  }

  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device."
  }

  if (name === "NotReadableError") {
    return "The camera is unavailable. Close other apps using it and try again."
  }

  return "Unable to start the QR scanner right now."
}

function decodeQrFromImageFile(file: File, canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      try {
        const maxDimension = 1600
        const naturalWidth = image.naturalWidth || image.width
        const naturalHeight = image.naturalHeight || image.height
        const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight))
        const width = Math.max(1, Math.round(naturalWidth * scale))
        const height = Math.max(1, Math.round(naturalHeight * scale))

        canvas.width = width
        canvas.height = height
        const context = canvas.getContext("2d", { willReadFrequently: true })
        if (!context) {
          reject(new Error("Could not read this image."))
          return
        }

        context.drawImage(image, 0, 0, width, height)
        const imageData = context.getImageData(0, 0, width, height)
        const result = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth",
        })

        if (!result?.data) {
          reject(new Error("No QR code was found in that image. Try a clearer, closer photo."))
          return
        }

        resolve(result.data)
      } catch {
        reject(new Error("Could not read this QR image. Try another photo."))
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("Could not load this image."))
    }

    image.src = objectUrl
  })
}

export function AssetQrScannerDialog({
  open,
  resolving = false,
  resolveError = "",
  onOpenChange,
  onQrCodeDetected,
  onManualAssetCode,
}: AssetQrScannerDialogProps) {
  const [status, setStatus] = useState<ScannerStatus>("idle")
  const [cameraError, setCameraError] = useState("")
  const [photoError, setPhotoError] = useState("")
  const [decodingPhoto, setDecodingPhoto] = useState(false)
  const [manualAssetCode, setManualAssetCode] = useState("")
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const detectedRef = useRef(false)
  const onQrCodeDetectedRef = useRef(onQrCodeDetected)
  const onManualAssetCodeRef = useRef(onManualAssetCode)

  useEffect(() => {
    onQrCodeDetectedRef.current = onQrCodeDetected
  }, [onQrCodeDetected])

  useEffect(() => {
    onManualAssetCodeRef.current = onManualAssetCode
  }, [onManualAssetCode])

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const scanFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || detectedRef.current) {
      return
    }

    if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
      const width = video.videoWidth
      const height = video.videoHeight
      canvas.width = width
      canvas.height = height

      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (context) {
        context.drawImage(video, 0, 0, width, height)
        const imageData = context.getImageData(0, 0, width, height)
        const result = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth",
        })

        if (result?.data) {
          detectedRef.current = true
          setStatus("detected")
          stopCamera()
          onQrCodeDetectedRef.current(result.data)
          return
        }
      }
    }

    animationFrameRef.current = window.requestAnimationFrame(scanFrame)
  }, [stopCamera])

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(getCameraUnavailableMessage())
      setStatus("error")
      return
    }

    try {
      detectedRef.current = false
      setCameraError("")
      setPhotoError("")
      setStatus("starting")
      stopCamera()

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        throw new Error("Scanner video could not be initialized.")
      }

      video.srcObject = stream
      await video.play()
      setStatus("scanning")
      animationFrameRef.current = window.requestAnimationFrame(scanFrame)
    } catch (error) {
      stopCamera()
      setCameraError(getCameraErrorMessage(error))
      setStatus("error")
    }
  }, [scanFrame, stopCamera])

  useEffect(() => {
    if (!open) {
      stopCamera()
      setStatus("idle")
      setCameraError("")
      setPhotoError("")
      setDecodingPhoto(false)
      setManualAssetCode("")
      detectedRef.current = false
      return
    }

    void startCamera()

    return () => {
      stopCamera()
    }
  }, [open, startCamera, stopCamera])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  const submitManualCode = () => {
    const trimmedCode = manualAssetCode.trim()
    if (!trimmedCode) {
      return
    }
    detectedRef.current = true
    stopCamera()
    onManualAssetCodeRef.current(trimmedCode)
  }

  const handlePhotoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) {
      return
    }

    const canvas = canvasRef.current
    if (!canvas) {
      setPhotoError("The QR image reader is not ready. Try again.")
      return
    }

    try {
      setPhotoError("")
      setCameraError("")
      setDecodingPhoto(true)
      const decodedValue = await decodeQrFromImageFile(file, canvas)
      detectedRef.current = true
      setStatus("detected")
      stopCamera()
      onQrCodeDetectedRef.current(decodedValue)
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Could not read this QR image.")
    } finally {
      setDecodingPhoto(false)
    }
  }

  const scannerMessage =
    decodingPhoto
      ? "Reading QR photo..."
      : status === "starting"
      ? "Starting camera..."
      : status === "scanning"
        ? "Scanning for QR code..."
        : status === "detected"
          ? "QR code detected."
          : cameraError || "Scanner ready."

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[560px] overflow-y-auto border-[#8BBCE8] p-0">
        <DialogHeader className="border-b border-[#D5E7F7] px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-[#0B1F3A]">
            <QrCode className="h-5 w-5 text-[#0072CE]" />
            Scan Asset QR
          </DialogTitle>
          <DialogDescription className="text-[#476783]">
            Link the fault report to the scanned asset.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-5">
          <div className="overflow-hidden rounded-xl border border-[#9FC5EA] bg-[#081B32]">
            <div className="relative aspect-[4/3] w-full">
              <video
                ref={videoRef}
                muted
                playsInline
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-[68%] w-[68%] rounded-2xl border-2 border-white/85 shadow-[0_0_0_999px_rgba(2,12,24,0.42)]" />
              </div>
              {status === "starting" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-[#081B32]/82 text-sm font-medium text-white">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting camera...
                </div>
              ) : null}
            </div>
          </div>

          <canvas ref={canvasRef} className="hidden" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => void handlePhotoFileChange(event)}
            className="hidden"
          />

          <div
            className={
              status === "error" || resolveError || photoError
                ? "rounded-lg border border-[#EDB7B7] bg-[#FFF5F5] px-4 py-3 text-sm text-[#A83A3A]"
                : "rounded-lg border border-[#BFD9F2] bg-[#F6FAFF] px-4 py-3 text-sm text-[#28547C]"
            }
          >
            {resolving ? "Opening asset report..." : resolveError || photoError || scannerMessage}
          </div>

          <div className="rounded-lg border border-[#D5E7F7] bg-white px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[#315A82]">
                If live camera scanning is blocked, take a clear photo of the QR label.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={resolving || decodingPhoto}
                className="h-10 border-[#0072CE]/35 bg-white text-[#0B1F3A]"
              >
                {decodingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Take QR Photo
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              value={manualAssetCode}
              onChange={(event) => setManualAssetCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  submitManualCode()
                }
              }}
              placeholder="Asset code"
              aria-label="Asset code"
              disabled={resolving}
            />
            <Button
              type="button"
              onClick={submitManualCode}
              disabled={!manualAssetCode.trim() || resolving}
              className="h-10"
            >
              Use Code
            </Button>
          </div>
        </div>

        <DialogFooter className="border-t border-[#D5E7F7] px-5 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => void startCamera()}
            disabled={status === "starting" || resolving}
          >
            {status === "starting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Restart
          </Button>
          <Button
            type="button"
            onClick={() => void startCamera()}
            disabled={status === "starting" || status === "scanning" || resolving}
          >
            <Camera className="h-4 w-4" />
            Start Camera
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
