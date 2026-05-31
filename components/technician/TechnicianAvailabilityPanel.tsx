"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Clock3, LoaderCircle, LogIn, LogOut, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getTechnicians,
  submitTechnicianCheckpoint,
  type Technician,
  type TechnicianCheckpointAction,
  type TechnicianCheckpointResponse,
} from "@/lib/api"
import { getStoredUserSession, type AuthUser } from "@/lib/auth"
import { cn } from "@/lib/utils"

type StatusMessage = {
  tone: "success" | "error" | "info"
  text: string
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "Not recorded"
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function getCheckedInState(technician: Technician | null): boolean | null {
  if (!technician) {
    return null
  }
  if (typeof technician.checked_in === "boolean") {
    return technician.checked_in
  }
  if (!technician.is_available || !technician.last_check_in_at) {
    return false
  }
  if (!technician.last_check_out_at) {
    return true
  }
  return new Date(technician.last_check_in_at).getTime() >= new Date(technician.last_check_out_at).getTime()
}

function findCurrentTechnician(technicians: Technician[], session: AuthUser | null): Technician | null {
  if (!session) {
    return null
  }
  return technicians.find((technician) => technician.user_id === session.id) ?? null
}

export function TechnicianAvailabilityPanel() {
  const [session, setSession] = useState<AuthUser | null>(null)
  const [technician, setTechnician] = useState<Technician | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [loadingAction, setLoadingAction] = useState<TechnicianCheckpointAction | null>(null)
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null)
  const [lastResponse, setLastResponse] = useState<TechnicianCheckpointResponse | null>(null)

  const checkedIn = useMemo(() => getCheckedInState(technician), [technician])
  const isTechnicianSession = session?.role === "technician"

  const loadTechnicianProfile = useCallback(async (nextSession?: AuthUser | null) => {
    const activeSession = typeof nextSession === "undefined" ? getStoredUserSession() : nextSession
    setSession(activeSession)

    if (!activeSession || activeSession.role !== "technician") {
      setTechnician(null)
      setLoadingProfile(false)
      return
    }

    setLoadingProfile(true)
    try {
      const technicians = await getTechnicians()
      const currentTechnician = findCurrentTechnician(technicians, activeSession)
      setTechnician(currentTechnician)
      if (!currentTechnician) {
        setStatusMessage({ tone: "error", text: "Technician profile not found for this account." })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load technician availability."
      setStatusMessage({ tone: "error", text: message })
    } finally {
      setLoadingProfile(false)
    }
  }, [])

  useEffect(() => {
    const refreshSession = () => {
      const nextSession = getStoredUserSession()
      void loadTechnicianProfile(nextSession)
    }

    refreshSession()
    window.addEventListener("storage", refreshSession)
    window.addEventListener("lec-auth-session-change", refreshSession)
    return () => {
      window.removeEventListener("storage", refreshSession)
      window.removeEventListener("lec-auth-session-change", refreshSession)
    }
  }, [loadTechnicianProfile])

  const handleCheckpoint = async (action: TechnicianCheckpointAction) => {
    if (!isTechnicianSession) {
      setStatusMessage({ tone: "error", text: "Sign in with a technician account to check in or out." })
      return
    }

    setLoadingAction(action)
    setStatusMessage(null)

    try {
      const response = await submitTechnicianCheckpoint({ action })
      setTechnician(response.technician)
      setLastResponse(response)
      setStatusMessage({
        tone: "success",
        text: `${response.message} ${response.assignment_note}`.trim(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update technician availability."
      setStatusMessage({ tone: "error", text: message })
    } finally {
      setLoadingAction(null)
    }
  }

  const availabilityLabel =
    checkedIn === null
      ? loadingProfile
        ? "Loading Availability"
        : "Availability Unknown"
      : checkedIn
        ? "Checked In"
        : "Checked Out"

  return (
    <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
      <CardHeader className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#0B1F3A]">
            <Clock3 className="h-5 w-5 text-[#0072CE]" />
            Availability Checkpoint
          </CardTitle>
          <p className="text-sm text-[#4A6A96]">
            Check in to receive automatic ticket assignments. Check out when you are no longer available.
          </p>
        </div>
        <div
          className={cn(
            "inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
            checkedIn
              ? "border-[#A7E3C2] bg-[#EFFBF5] text-[#12633A]"
              : checkedIn === false
                ? "border-[#F0B3B8] bg-[#FFF3F4] text-[#9F2D38]"
                : "border-[#BFD7EF] bg-[#F1F7FE] text-[#235D8F]"
          )}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              checkedIn ? "bg-[#198754]" : checkedIn === false ? "bg-[#C43745]" : "bg-[#3390DA]"
            )}
          />
          {availabilityLabel}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[#D6E6F7] bg-[#F7FBFF] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#4A6A96]">Last Check In</p>
              <p className="mt-1 text-sm font-semibold text-[#0B1F3A]">{formatDateTime(technician?.last_check_in_at)}</p>
            </div>
            <div className="rounded-lg border border-[#D6E6F7] bg-[#F7FBFF] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#4A6A96]">Last Check Out</p>
              <p className="mt-1 text-sm font-semibold text-[#0B1F3A]">{formatDateTime(technician?.last_check_out_at)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button
              type="button"
              disabled={loadingProfile || loadingAction !== null || !isTechnicianSession}
              onClick={() => void handleCheckpoint("check_in")}
              className="h-10 rounded-lg bg-[#168A5A] px-4 text-white hover:bg-[#0B1F3A]"
            >
              {loadingAction === "check_in" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {loadingAction === "check_in" ? "Checking In" : "Check In"}
            </Button>
            <Button
              type="button"
              disabled={loadingProfile || loadingAction !== null || !isTechnicianSession}
              onClick={() => void handleCheckpoint("check_out")}
              variant="outline"
              className="h-10 rounded-lg border-[#C43745]/35 px-4 text-[#9F2D38]"
            >
              {loadingAction === "check_out" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              {loadingAction === "check_out" ? "Checking Out" : "Check Out"}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={loadingProfile || loadingAction !== null}
              aria-label="Refresh availability"
              title="Refresh availability"
              onClick={() => void loadTechnicianProfile(session)}
              className="hidden h-10 w-10 rounded-lg sm:inline-flex"
            >
              <RefreshCw className={cn("h-4 w-4", loadingProfile ? "animate-spin" : "")} />
            </Button>
          </div>
        </div>

        {lastResponse ? (
          <p className="text-xs text-[#4A6A96]">Recorded at {formatDateTime(lastResponse.recorded_at)}.</p>
        ) : null}

        {statusMessage ? (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              statusMessage.tone === "success"
                ? "border-[#A7E3C2] bg-[#EFFBF5] text-[#12633A]"
                : statusMessage.tone === "error"
                  ? "border-[#F0B3B8] bg-[#FFF3F4] text-[#9F2D38]"
                  : "border-[#BFD7EF] bg-[#F1F7FE] text-[#235D8F]"
            )}
          >
            {statusMessage.text}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
