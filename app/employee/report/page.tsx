"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Loader2, ScanQrCode } from "lucide-react"

import { AiIntakeDraftEditor } from "@/components/intake/AiIntakeDraftEditor"
import { AssetQrScannerDialog } from "@/components/inventory/AssetQrScannerDialog"
import AudioRecorder from "@/components/ui/AudioRecorder"
import { EmployeeBackButton } from "@/components/layout/EmployeeBackButton"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"
import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buildAssetFaultReportPath, parseAssetScanToken } from "@/lib/asset-qr"
import { normalizeAssetCode } from "@/lib/assetQrAssets"
import {
  createAiIntakeDraft,
  createTicket,
  getConsumableById,
  type TicketIntakeDraft,
  type TicketIntakeDraftResponse,
} from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"

type IntakeMessage = {
  id: number
  role: "employee" | "assistant"
  content: string
}

const emptyDraft: TicketIntakeDraft = {
  title: "",
  description: "",
  category: "Software",
  priority: "Medium",
  asset: "",
  impact: "",
  branch: "",
  department: "",
}

type ScannedAssetTarget =
  | { type: "faultPath"; path: string }
  | { type: "scanToken"; token: string }
  | { type: "assetCode"; assetCode: string }

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function getUrlPathFromScannedValue(value: string): string | null {
  const trimmedValue = value.trim()
  const looksLikeUrl = /^https?:\/\//i.test(trimmedValue) || trimmedValue.startsWith("/")
  if (!looksLikeUrl) {
    return null
  }

  try {
    const fallbackOrigin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3000"
    return new URL(trimmedValue, fallbackOrigin).pathname
  } catch {
    return null
  }
}

function getAssetCodeFromQuery(value: string): string | null {
  const trimmedValue = value.trim()
  let params: URLSearchParams | null = null

  try {
    if (/^https?:\/\//i.test(trimmedValue) || trimmedValue.startsWith("/")) {
      const fallbackOrigin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3000"
      params = new URL(trimmedValue, fallbackOrigin).searchParams
    } else if (trimmedValue.includes("=")) {
      params = new URLSearchParams(trimmedValue.startsWith("?") ? trimmedValue.slice(1) : trimmedValue)
    }
  } catch {
    params = null
  }

  if (!params) {
    return null
  }

  for (const key of ["assetCode", "asset_code", "asset", "code"]) {
    const candidate = params.get(key)
    if (candidate?.trim()) {
      return normalizeAssetCode(candidate)
    }
  }

  return null
}

function getRawAssetCode(value: string): string | null {
  const normalizedValue = normalizeAssetCode(value)
  if (/^[A-Z0-9][A-Z0-9._-]{1,79}$/.test(normalizedValue)) {
    return normalizedValue
  }
  return null
}

function getScannedAssetTarget(value: string): ScannedAssetTarget | null {
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return null
  }

  const scannedPath = getUrlPathFromScannedValue(trimmedValue)
  if (scannedPath) {
    const faultPathMatch = scannedPath.match(/^\/asset-qr\/report\/([^/?#]+)\/?$/i)
    if (faultPathMatch?.[1]) {
      return {
        type: "faultPath",
        path: buildAssetFaultReportPath(decodePathSegment(faultPathMatch[1])),
      }
    }

    const scanTokenMatch = scannedPath.match(/^\/asset-scan\/([^/?#]+)\/?$/i)
    if (scanTokenMatch?.[1]) {
      return {
        type: "scanToken",
        token: decodePathSegment(scanTokenMatch[1]),
      }
    }
  }

  const queryAssetCode = getAssetCodeFromQuery(trimmedValue)
  if (queryAssetCode) {
    return {
      type: "assetCode",
      assetCode: queryAssetCode,
    }
  }

  const rawAssetCode = getRawAssetCode(trimmedValue)
  if (rawAssetCode) {
    return {
      type: "assetCode",
      assetCode: rawAssetCode,
    }
  }

  return null
}

async function resolveAssetFaultReportPath(scannedValue: string): Promise<string> {
  const target = getScannedAssetTarget(scannedValue)
  if (!target) {
    throw new Error("This QR code is not an asset fault QR code.")
  }

  if (target.type === "faultPath") {
    return target.path
  }

  if (target.type === "assetCode") {
    return buildAssetFaultReportPath(target.assetCode)
  }

  const tokenPayload = parseAssetScanToken(target.token)
  if (!tokenPayload) {
    throw new Error("This asset QR token is invalid.")
  }

  const asset = await getConsumableById(tokenPayload.asset_id)
  const assetCode = normalizeAssetCode(asset.asset_tag || `AST-${asset.id}`)
  return buildAssetFaultReportPath(assetCode)
}

function buildAssistantSummary(payload: TicketIntakeDraftResponse): string {
  const confidencePercent = Math.round(payload.confidence * 100)
  if (payload.intake_mode === "direct") {
    return `I drafted a structured ticket with ${confidencePercent}% confidence. Review it below, then confirm the submission.`
  }
  if (payload.intake_mode === "follow_up") {
    return `I drafted a ticket with ${confidencePercent}% confidence, but I still need a few confirmations before you submit it.`
  }
  return `I drafted a low-confidence ticket (${confidencePercent}%). Please complete the manual details before submission.`
}

export default function EmployeeReportPage() {
  const router = useRouter()
  const [message, setMessage] = useState("")
  const [conversation, setConversation] = useState<IntakeMessage[]>([])
  const [draftResponse, setDraftResponse] = useState<TicketIntakeDraftResponse | null>(null)
  const [draft, setDraft] = useState<TicketIntakeDraft>(emptyDraft)
  const [analyzing, setAnalyzing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerError, setScannerError] = useState("")
  const [resolvingScan, setResolvingScan] = useState(false)
  const [shouldReturnAfterDialog, setShouldReturnAfterDialog] = useState(false)
  const [resultDialog, setResultDialog] = useState<{
    open: boolean
    status: "success" | "error"
    message: string
  }>({
    open: false,
    status: "success",
    message: "",
  })

  const showResultDialog = (
    status: "success" | "error",
    nextMessage: string,
    shouldReturn: boolean = false
  ) => {
    setShouldReturnAfterDialog(shouldReturn)
    setResultDialog({
      open: true,
      status,
      message: nextMessage,
    })
  }

  const handleAnalyze = async () => {
    const user = getStoredUserSession()
    if (!user) {
      showResultDialog("error", "Session expired. Please login again.")
      return
    }

    const trimmedMessage = message.trim()
    if (!trimmedMessage) {
      showResultDialog("error", "Describe the issue before requesting an AI draft.")
      return
    }

    try {
      setAnalyzing(true)
      const payload = await createAiIntakeDraft({
        message: trimmedMessage,
        user_id: user.id,
        channel: "employee_text",
      })

      setConversation((current) => [
        ...current,
        { id: current.length + 1, role: "employee", content: trimmedMessage },
        { id: current.length + 2, role: "assistant", content: buildAssistantSummary(payload) },
      ])
      setDraftResponse(payload)
      setDraft(payload.draft)
      setMessage("")
    } catch (draftError) {
      showResultDialog(
        "error",
        draftError instanceof Error ? draftError.message : "Failed to prepare AI draft."
      )
    } finally {
      setAnalyzing(false)
    }
  }

  const handleSubmit = async () => {
    const user = getStoredUserSession()
    if (!user) {
      showResultDialog("error", "Session expired. Please login again.")
      return
    }

    if (!draft.title.trim()) {
      showResultDialog("error", "Draft title is required before submission.")
      return
    }
    if (!draft.description.trim()) {
      showResultDialog("error", "Draft description is required before submission.")
      return
    }
    if (!draft.branch?.trim()) {
      showResultDialog("error", "Branch is required before submission.")
      return
    }
    if (!draft.department?.trim()) {
      showResultDialog("error", "Department is required before submission.")
      return
    }

    try {
      setSubmitting(true)
      const ticket = await createTicket({
        title: draft.title.trim(),
        description: draft.description.trim(),
        category: draft.category,
        priority: draft.priority,
        location: draft.branch.trim(),
        department: draft.department.trim(),
        asset: draft.asset?.trim(),
        impact: draft.impact?.trim(),
        ai_confidence: draftResponse?.confidence,
        employee_id: user.id,
        reporter_reviewed_problem: true,
      })
      showResultDialog(
        "success",
        ticket.routing_note ?? `Ticket #${ticket.id} created and auto-routed.`,
        true
      )
      setDraftResponse(null)
      setDraft(emptyDraft)
      setConversation([])
    } catch (submitError) {
      showResultDialog(
        "error",
        submitError instanceof Error ? submitError.message : "Failed to submit ticket."
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleDialogOk = () => {
    setResultDialog((current) => ({ ...current, open: false }))
    if (shouldReturnAfterDialog) {
      router.push("/employee/dashboard")
    }
  }

  const handleReportAgain = () => {
    setResultDialog((current) => ({ ...current, open: false }))
  }

  const handleTranscript = (transcript: string) => {
    setMessage(transcript)
  }

  const openScanner = () => {
    setScannerError("")
    setScannerOpen(true)
  }

  const handleScannedAssetQr = async (scannedValue: string) => {
    try {
      setScannerError("")
      setResolvingScan(true)
      const reportPath = await resolveAssetFaultReportPath(scannedValue)
      setScannerOpen(false)
      router.push(reportPath)
    } catch (error) {
      setScannerError(error instanceof Error ? error.message : "Unable to open an asset fault report from this QR code.")
    } finally {
      setResolvingScan(false)
    }
  }

  return (
    <div className="space-y-6">
      <EmployeeBackButton />

      <EmployeePageHero
        title="Report Fault"
        description="Describe the issue in natural language, let AI draft the ticket, then confirm the final version before submission."
      />

      <Card className="mx-auto w-full max-w-[900px] rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#0072CE]/15 px-5 py-4">
          <CardTitle className="text-base font-semibold text-[#0B1F3A]">AI Conversational Intake</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-5 py-5">
          <div className="rounded-lg border border-[#9FC5EA] bg-[#F6FAFF] px-4 py-3 text-sm text-[#1F4E7A]">
            Tell the system what happened, what is affected, and the business impact. The draft below will stay editable before submission.
          </div>

          <div className="rounded-lg border border-[#0072CE]/30 bg-[#F8FBFF] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#9FC5EA] bg-white text-[#0072CE]">
                  <ScanQrCode className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#0B1F3A]">Report a scanned asset</p>
                  <p className="mt-1 text-sm text-[#315A82]">
                    Open the camera scanner and start a fault report for the asset QR label.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                onClick={openScanner}
                disabled={resolvingScan}
                className="h-10 rounded-lg bg-[#0072CE] px-4 text-sm font-semibold text-white"
              >
                {resolvingScan ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanQrCode className="h-4 w-4" />}
                Scan Asset QR
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="fault-intake-message" className="text-sm font-medium text-[#0B1F3A]">
              Describe the issue
            </label>
            <textarea
              id="fault-intake-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-28 w-full rounded-lg border border-[#0072CE]/30 px-3 py-2 text-sm text-[#0B1F3A]"
              placeholder="Example: Our printer on the finance floor disconnects every afternoon and the team cannot print invoices."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-[#0B1F3A]">
              Or record your issue
            </label>
            <AudioRecorder 
              onTranscript={handleTranscript}
              className="border border-[#0072CE]/30 rounded-lg p-4"
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={analyzing}
              className="h-10 rounded-lg border border-[#005DA8] bg-[#0072CE] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#005DA8] focus-visible:ring-2 focus-visible:ring-[#0072CE]/40 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {analyzing ? "Building Draft..." : "Create AI Draft"}
            </Button>
          </div>

          {conversation.length > 0 ? (
            <div className="space-y-3 rounded-xl border border-[#DCE8F5] bg-[#FAFCFF] p-4">
              {conversation.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl px-4 py-3 text-sm ${
                    item.role === "employee"
                      ? "ml-8 bg-[#0072CE] text-white"
                      : "mr-8 border border-[#9FC5EA] bg-white text-[#1F4E7A]"
                  }`}
                >
                  {item.content}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {draftResponse ? (
        <AiIntakeDraftEditor
          draft={draft}
          confidence={draftResponse.confidence}
          intakeMode={draftResponse.intake_mode}
          followUpQuestions={draftResponse.follow_up_questions}
          submitting={submitting}
          submitLabel="Confirm and Submit Ticket"
          onChange={setDraft}
          onSubmit={() => void handleSubmit()}
        />
      ) : null}

      <ActionFeedbackDialog
        open={resultDialog.open}
        status={resultDialog.status}
        message={resultDialog.message}
        onOk={handleDialogOk}
        secondaryActionLabel="Create Another Ticket"
        onSecondaryAction={handleReportAgain}
      />

      <AssetQrScannerDialog
        open={scannerOpen}
        resolving={resolvingScan}
        resolveError={scannerError}
        onOpenChange={setScannerOpen}
        onQrCodeDetected={(value) => void handleScannedAssetQr(value)}
        onManualAssetCode={(assetCode) => void handleScannedAssetQr(assetCode)}
      />
    </div>
  )
}
