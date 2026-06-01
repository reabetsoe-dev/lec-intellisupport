"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Clock3, LogIn, LogOut, ShieldCheck, Smartphone } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { readHttpResponse } from "@/lib/http-response"
import {
  buildSwitchLoginHref,
  buildTechnicianQrMainLoginHref,
  getStoredUserSession,
  LOGIN_SOURCE_TECHNICIAN_QR,
  type AuthUser,
} from "@/lib/auth"
import {
  type TechnicianCheckpointAction,
  type TechnicianCheckpointResponse,
} from "@/lib/api"

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

async function submitTechnicianCheckpointViaFrontend(requestPayload: {
  action: TechnicianCheckpointAction
  token?: string
  email?: string
  password?: string
}): Promise<TechnicianCheckpointResponse> {
  let response: Response

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (requestPayload.token?.trim()) {
      headers.Authorization = `Bearer ${requestPayload.token.trim()}`
    }

    response = await fetch("/api/technician-access/checkpoint", {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: requestPayload.action,
        email: requestPayload.email,
        password: requestPayload.password,
      }),
    })
  } catch {
    throw new Error("Cannot reach the QR checkpoint service. Ensure the frontend is running.")
  }

  const { isHtml, message, payload: responsePayload } = await readHttpResponse(response)

  if (!response.ok) {
    throw new Error(
      message ??
        (isHtml
          ? "The QR checkpoint service returned HTML instead of JSON. Check the frontend and backend configuration."
          : "Unable to update technician availability.")
    )
  }

  if (!responsePayload || typeof responsePayload !== "object" || Array.isArray(responsePayload)) {
    throw new Error("The QR checkpoint service returned an invalid response payload.")
  }

  return responsePayload as TechnicianCheckpointResponse
}

export default function TechnicianAccessPage() {
  const mainLoginHref = buildTechnicianQrMainLoginHref()
  const technicianLoginHref = buildSwitchLoginHref({
    source: LOGIN_SOURCE_TECHNICIAN_QR,
    nextPath: "/technician-access",
  })
  const [sessionReady, setSessionReady] = useState(false)
  const [session, setSession] = useState<AuthUser | null>(null)
  const [loadingAction, setLoadingAction] = useState<TechnicianCheckpointAction | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState<TechnicianCheckpointResponse | null>(null)
  const [currentTimeLabel, setCurrentTimeLabel] = useState("Loading current time...")
  const [credentialEmail, setCredentialEmail] = useState("")
  const [credentialPassword, setCredentialPassword] = useState("")

  useEffect(() => {
    const refreshSession = () => {
      setSession(getStoredUserSession())
      setSessionReady(true)
    }
    refreshSession()
    window.addEventListener("storage", refreshSession)
    window.addEventListener("lec-auth-session-change", refreshSession)
    return () => {
      window.removeEventListener("storage", refreshSession)
      window.removeEventListener("lec-auth-session-change", refreshSession)
    }
  }, [])

  useEffect(() => {
    const updateCurrentTime = () => {
      setCurrentTimeLabel(new Date().toLocaleString())
    }

    updateCurrentTime()
    const intervalId = window.setInterval(() => {
      updateCurrentTime()
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  const isTechnicianSession = session?.role === "technician"
  const hasDirectCredentials = credentialEmail.trim().length > 0 && credentialPassword.trim().length > 0

  const handleCheckpoint = async (action: TechnicianCheckpointAction) => {
    const trimmedCredentialEmail = credentialEmail.trim()
    const useDirectCredentials = trimmedCredentialEmail.length > 0 || credentialPassword.trim().length > 0

    if (!sessionReady) {
      setError("Preparing technician access. Please try again.")
      setSuccess(null)
      return
    }

    if (useDirectCredentials) {
      if (!trimmedCredentialEmail || !credentialPassword.trim()) {
        setError("Enter technician email and password to continue.")
        setSuccess(null)
        return
      }
    } else {
      if (!session) {
        setError("Enter technician email and password, or sign in first.")
        setSuccess(null)
        return
      }

      if (!isTechnicianSession) {
        setError("Use technician email and password below, or switch to a technician account.")
        setSuccess(null)
        return
      }

      if (!session.token?.trim()) {
        setError("Your session is missing a token. Please sign in again.")
        setSuccess(null)
        return
      }
    }

    setError("")
    setLoadingAction(action)

    try {
      const response = await submitTechnicianCheckpointViaFrontend({
        action,
        token: useDirectCredentials ? undefined : session?.token,
        email: useDirectCredentials ? trimmedCredentialEmail : undefined,
        password: useDirectCredentials ? credentialPassword : undefined,
      })
      setSuccess(response)
      if (useDirectCredentials) {
        setCredentialPassword("")
      }
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unable to update technician availability."
      setError(message)
      setSuccess(null)
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#07101F] px-4 py-6 text-white sm:py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(39,119,191,0.28),transparent_40%),linear-gradient(145deg,#07101F_0%,#0B1F3A_46%,#123C67_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:20px_20px]" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-5 sm:gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-[#0F2442] p-3 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
              <Image
                src="/lec-logo.png"
                alt="LEC logo"
                width={96}
                height={96}
                priority
                className="h-16 w-16 rounded-full object-cover sm:h-20 sm:w-20"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8CC9F7]">Technician Access</p>
              <h1 className="text-2xl font-semibold text-white sm:text-4xl">Check In And Out From Your Phone</h1>
            </div>
          </div>
          <Link
            href={mainLoginHref}
            className="inline-flex touch-manipulation items-center justify-center rounded-full border border-white/20 bg-[#14385F] px-4 py-3 text-sm font-medium text-[#DCEBFF] transition hover:bg-[#1B4A7D]"
          >
            Main Login
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border border-white/10 bg-[#112A49] py-0 text-white shadow-[0_24px_60px_rgba(4,10,24,0.35)]">
            <CardHeader className="space-y-3 px-5 py-5 sm:px-6 sm:py-6">
              <CardTitle className="text-2xl font-semibold text-white">Availability Checkpoint</CardTitle>
              <p className="max-w-2xl text-sm leading-6 text-[#C8DCF6]">
                Scan the shared QR to access this page from your phone, then sign in with your technician login credentials.
                After login, use Check In or Check Out to update availability. The system records exact server time and uses
                technician availability for future automatic assignments.
              </p>
            </CardHeader>
            <CardContent className="space-y-5 px-5 pb-5 sm:px-6 sm:pb-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-[#0B1F3A] p-4">
                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-0.5 h-5 w-5 text-[#7FD0F3]" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-white">Current device time</p>
                      <p className="text-sm text-[#C8DCF6]">{currentTimeLabel}</p>
                      <p className="text-xs text-[#94B6DA]">Your check-in or check-out time is stamped by the system when you submit.</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0B1F3A] p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 text-[#7FD0F3]" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-white">Assignment behavior</p>
                      <p className="text-xs leading-6 text-[#C8DCF6]">
                        Checked in technicians stay eligible for new automatic ticket assignments. Checked out technicians are skipped.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0B1F3A] p-4">
                <div className="flex items-start gap-3">
                  <Smartphone className="mt-0.5 h-5 w-5 text-[#7FD0F3]" />
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-white">QR check-in/out flow</p>
                    <p className="text-sm leading-6 text-[#C8DCF6]">
                      Technicians can check in or out directly from this page using their technician email and password.
                      If you already have a technician session on this phone, the buttons will use it automatically.
                    </p>
                    <Link
                      href={mainLoginHref}
                      className="inline-flex touch-manipulation items-center rounded-full border border-white/20 bg-[#14385F] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#DCEBFF] transition hover:bg-[#1B4A7D]"
                    >
                      Open Main Login
                    </Link>
                  </div>
                </div>
              </div>

              {sessionReady ? (
                <div className="rounded-2xl border border-white/10 bg-[#0B1F3A] p-4">
                  {isTechnicianSession ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold tracking-[0.18em] text-[#8CC9F7] uppercase">Signed in technician</p>
                      <p className="text-lg font-semibold text-white">{session.name}</p>
                      <p className="text-sm text-[#C8DCF6]">{session.login_identifier || "Technician account"}</p>
                      <p className="pt-2 text-xs text-[#94B6DA]">
                        Check In and Check Out will use this active technician session unless you enter different technician credentials below.
                      </p>
                    </div>
                  ) : session ? (
                    <div className="space-y-3">
                      <p className="text-sm text-[#FFD7DA]">
                        You are signed in as <span className="font-semibold">{session.name}</span> ({session.role}).
                        That is fine. Check-in and check-out can still work below with technician credentials.
                      </p>
                      <Button
                        asChild
                        className="h-11 rounded-xl bg-gradient-to-r from-[#0E5EA2] via-[#1B72BD] to-[#0A4E87] text-white hover:from-[#0A4E87] hover:via-[#135F9F] hover:to-[#083C67]"
                      >
                        <Link href={technicianLoginHref}>
                          <LogIn className="h-4 w-4" />
                          Switch To Technician Login
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-[#C8DCF6]">
                        No main login is required here. Enter technician credentials below to continue, or open the main login if needed.
                      </p>
                      <Button
                        asChild
                        className="h-11 rounded-xl bg-gradient-to-r from-[#0E5EA2] via-[#1B72BD] to-[#0A4E87] text-white hover:from-[#0A4E87] hover:via-[#135F9F] hover:to-[#083C67]"
                      >
                        <Link href={technicianLoginHref}>
                          <LogIn className="h-4 w-4" />
                          Technician Login
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-[#0B1F3A] p-4 text-sm text-[#C8DCF6]">
                  Checking login session...
                </div>
              )}

              <div className="grid gap-4 rounded-2xl border border-white/10 bg-[#0B1F3A] p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="technician-email" className="text-[#C8DCF6]">
                    Technician Email
                  </Label>
                  <Input
                    id="technician-email"
                    name="technician-email"
                    type="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="email"
                    placeholder="name@lec.com"
                    value={credentialEmail}
                    onChange={(event) => {
                      setCredentialEmail(event.target.value)
                      if (error) {
                        setError("")
                      }
                    }}
                    className="h-11 border-white/10 bg-[#08182F] text-white placeholder:text-[#7F9EC2] focus-visible:border-[#5EBCE7] focus-visible:ring-[#5EBCE7]/40"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="technician-password" className="text-[#C8DCF6]">
                    Technician Password
                  </Label>
                  <Input
                    id="technician-password"
                    name="technician-password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter password"
                    value={credentialPassword}
                    onChange={(event) => {
                      setCredentialPassword(event.target.value)
                      if (error) {
                        setError("")
                      }
                    }}
                    className="h-11 border-white/10 bg-[#08182F] text-white placeholder:text-[#7F9EC2] focus-visible:border-[#5EBCE7] focus-visible:ring-[#5EBCE7]/40"
                  />
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-[#F49CA1]/45 bg-[#5E1520]/40 px-4 py-3 text-sm text-[#FFD7DA]">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  disabled={loadingAction !== null || (!isTechnicianSession && !hasDirectCredentials)}
                  onClick={() => void handleCheckpoint("check_in")}
                  className="h-14 touch-manipulation rounded-2xl bg-gradient-to-r from-[#2EC8A6] to-[#169F86] text-base font-semibold text-white hover:from-[#28B391] hover:to-[#118972]"
                >
                  <LogIn className="h-4 w-4" />
                  {loadingAction === "check_in" ? "Checking In..." : "Check In"}
                </Button>
                <Button
                  type="button"
                  disabled={loadingAction !== null || (!isTechnicianSession && !hasDirectCredentials)}
                  onClick={() => void handleCheckpoint("check_out")}
                  className="h-14 touch-manipulation rounded-2xl bg-gradient-to-r from-[#F56F79] to-[#DB3C49] text-base font-semibold text-white hover:from-[#E15D67] hover:to-[#C9333F]"
                >
                  <LogOut className="h-4 w-4" />
                  {loadingAction === "check_out" ? "Checking Out..." : "Check Out"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-[#112A49] py-0 text-white shadow-[0_24px_60px_rgba(4,10,24,0.35)]">
            <CardHeader className="px-5 py-5 sm:px-6 sm:py-6">
              <CardTitle className="text-xl font-semibold text-white">Latest Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
              {success ? (
                <>
                  <div className="rounded-2xl border border-[#8EDBC9]/35 bg-[#10382F]/55 p-4">
                    <p className="text-sm font-semibold text-[#DDFBF0]">{success.message}</p>
                    <p className="mt-1 text-xs leading-6 text-[#B9E9D8]">{success.assignment_note}</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#08182F]/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7FD0F3]">Technician</p>
                    <p className="mt-2 text-xl font-semibold text-white">{success.technician.name}</p>
                    <p className="text-sm text-[#C8DCF6]">{success.technician.email}</p>
                  </div>

                  <div className="grid gap-3">
                    <div className="rounded-2xl border border-white/10 bg-[#08182F]/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7FD0F3]">Current Availability</p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {success.technician.is_available ? "Available For New Tickets" : "Unavailable For New Tickets"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-[#08182F]/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7FD0F3]">Recorded Time</p>
                      <p className="mt-2 text-base font-semibold text-white">{formatDateTime(success.recorded_at)}</p>
                      <p className="mt-1 text-xs text-[#9DBADA]">Stored using the {success.timezone} support desk timezone.</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-[#08182F]/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7FD0F3]">Recent Activity</p>
                      <div className="mt-2 space-y-2 text-sm text-[#DCEBFF]">
                        <p>Last check in: {formatDateTime(success.technician.last_check_in_at)}</p>
                        <p>Last check out: {formatDateTime(success.technician.last_check_out_at)}</p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/15 bg-[#08182F] p-5 text-sm leading-6 text-[#C8DCF6]">
                  Submit a check-in or check-out action and the system will confirm your recorded time and assignment status here.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
