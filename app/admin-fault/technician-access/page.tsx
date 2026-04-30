"use client"

import { useEffect, useRef, useState } from "react"
import { Download, QrCode, Users, X } from "lucide-react"

import { AdminFaultBackButton } from "@/components/layout/AdminFaultBackButton"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"
import { QrCodeSvg } from "@/components/shared/QrCodeSvg"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { readHttpResponse } from "@/lib/http-response"
import { type Technician } from "@/lib/api"

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Not recorded yet"
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

type NetworkInfoResponse = {
  primaryAddress?: string | null
  candidates?: Array<{
    interfaceName: string
    address: string
  }>
}

async function getTechniciansViaFrontend(): Promise<Technician[]> {
  let response: Response

  try {
    response = await fetch("/api/technician-access/technicians", { cache: "no-store" })
  } catch {
    throw new Error("Cannot reach the technician QR service. Ensure the frontend is running.")
  }

  const { isHtml, message, payload } = await readHttpResponse(response)

  if (!response.ok) {
    throw new Error(
      message
        ? String(message)
        : isHtml
          ? "The technician QR service returned HTML instead of JSON. Check the frontend and backend configuration."
        : "Unable to load technician availability."
    )
  }

  if (!Array.isArray(payload)) {
    throw new Error("The technician QR service returned an invalid availability payload.")
  }

  return payload as Technician[]
}

export default function AdminFaultTechnicianAccessPage() {
  const [phoneUrl, setPhoneUrl] = useState("")
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [showAvailability, setShowAvailability] = useState(false)
  const qrContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let isMounted = true

    const buildPhoneUrl = (hostname: string) => {
      const protocol = window.location.protocol === "https:" ? "https:" : "http:"
      const port = window.location.port ? `:${window.location.port}` : ""
      return `${protocol}//${hostname}${port}/technician-access`
    }

    void (async () => {
      const initialUrl = buildPhoneUrl(window.location.hostname)
      setPhoneUrl(initialUrl)

      try {
        const response = await fetch("/api/network-info", { cache: "no-store" })
        if (!response.ok) {
          throw new Error("Unable to detect laptop network address.")
        }

        const { payload } = await readHttpResponse(response)
        const networkInfo =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as NetworkInfoResponse)
            : null
        const detectedAddress =
          typeof networkInfo?.primaryAddress === "string" ? networkInfo.primaryAddress.trim() : ""

        if (detectedAddress && isMounted) {
          setPhoneUrl(buildPhoneUrl(detectedAddress))
        }
      } catch {
        // Keep the current URL if network detection fails.
      }

      try {
        const payload = await getTechniciansViaFrontend()
        if (!isMounted) {
          return
        }
        setTechnicians(payload)
        setLoadError("")
      } catch (error) {
        if (!isMounted) {
          return
        }
        setLoadError(error instanceof Error ? error.message : "Unable to load technician availability.")
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    })()

    return () => {
      isMounted = false
    }
  }, [])

  const handleDownloadQr = () => {
    const svgElement = qrContainerRef.current?.querySelector("svg")
    if (!svgElement) {
      return
    }

    try {
      const serializer = new XMLSerializer()
      let svgMarkup = serializer.serializeToString(svgElement)

      if (!svgMarkup.includes('xmlns="http://www.w3.org/2000/svg"')) {
        svgMarkup = svgMarkup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')
      }

      const blob = new Blob([svgMarkup], {
        type: "image/svg+xml;charset=utf-8",
      })
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = "technician-checkpoint-qr.svg"
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      window.alert("Unable to download the QR code right now. Please try again.")
    }
  }

  return (
    <div className="space-y-6">
      <AdminFaultBackButton />
      <EmployeePageHero
        title="Technician QR Access"
        description="Share one phone-friendly checkpoint page so technicians can scan, sign in with their credentials, and update availability for automatic routing."
      />

      <div className="grid gap-6">
        <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 px-6 py-5">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#0B1F3A]">
              <QrCode className="h-5 w-5 text-[#0A63B8]" />
              QR Share Panel
            </CardTitle>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAvailability(true)}
                className="border-[#BFD8F3] bg-white text-[#0B1F3A] hover:bg-[#EEF6FF] hover:text-[#0B1F3A]"
              >
                <Users className="h-4 w-4" />
                View Attendance
              </Button>
              <Button
                type="button"
                onClick={handleDownloadQr}
                variant="outline"
                className="border-[#BFD8F3] bg-white text-[#0B1F3A] hover:bg-[#EEF6FF] hover:text-[#0B1F3A]"
              >
                <Download className="h-4 w-4" />
                Download QR
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="rounded-3xl border border-[#D1E3F7] bg-[linear-gradient(180deg,#FDFEFF_0%,#F1F8FF_100%)] p-6 text-center">
              <div
                ref={qrContainerRef}
                className="mx-auto w-full max-w-[20rem] rounded-3xl border border-[#D8E6F5] bg-white p-4 shadow-[0_10px_24px_rgba(8,43,76,0.08)]"
              >
                {phoneUrl.trim() ? (
                  <QrCodeSvg value={phoneUrl.trim()} size={320} className="mx-auto w-full max-w-[320px]" />
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {showAvailability ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07101F]/55 px-4 py-6 backdrop-blur-[2px]">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-[#C6DAEE] bg-white shadow-[0_28px_70px_rgba(7,16,31,0.28)]">
            <div className="flex items-center justify-between border-b border-[#DCE9F6] px-6 py-5">
              <div>
                <p className="text-sm font-semibold text-[#0B1F3A]">Live Technician Availability</p>
                <p className="text-xs text-[#4F6F95]">Attendance details are opened separately from the QR panel.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAvailability(false)}
                className="border-[#BFD8F3] bg-white text-[#0B1F3A] hover:bg-[#EEF6FF] hover:text-[#0B1F3A]"
              >
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>

            <div className="max-h-[calc(90vh-5.5rem)] overflow-y-auto px-6 py-5">
              {loadError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {loadError}
                </div>
              ) : null}

              {loading ? (
                <p className="text-sm text-[#4A6A96]">Loading technicians...</p>
              ) : technicians.length === 0 ? (
                <p className="text-sm text-[#4A6A96]">No technicians found.</p>
              ) : (
                <div className="space-y-3">
                  {technicians.map((technician) => (
                    <div
                      key={technician.id}
                      className="rounded-2xl border border-[#D8E6F5] bg-[linear-gradient(180deg,#FCFEFF_0%,#F4F9FF_100%)] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[#0B1F3A]">{technician.name}</p>
                          <p className="text-xs text-[#4F6F95]">{technician.email}</p>
                          <p className="mt-1 text-xs text-[#4F6F95]">{technician.skillset} technician</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant="outline"
                            className={
                              technician.is_available
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-800"
                            }
                          >
                            {technician.is_available ? "Checked In" : "Checked Out"}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              technician.is_active
                                ? "border-[#C6DAEE] bg-[#F2F8FF] text-[#426A96]"
                                : "border-slate-200 bg-slate-50 text-slate-500"
                            }
                          >
                            {technician.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className="rounded-full border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700"
                        >
                          Last check in: {formatDateTime(technician.last_check_in_at)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800"
                        >
                          Last check out: {formatDateTime(technician.last_check_out_at)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full border-[#C6DAEE] bg-[#F2F8FF] px-3 py-1.5 text-xs font-medium text-[#426A96]"
                        >
                          Availability updated: {formatDateTime(technician.availability_updated_at)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
