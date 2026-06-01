"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { AssetFaultQrScanner } from "@/components/inventory/AssetFaultQrScanner"
import { AiIntakeDraftEditor } from "@/components/intake/AiIntakeDraftEditor"
import { EmployeeBackButton } from "@/components/layout/EmployeeBackButton"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"
import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { createAiIntakeDraft, createTicket, getEmployee, type TicketIntakeDraft, type TicketIntakeDraftResponse } from "@/lib/api"
import { getStoredUserSession, persistUserSession, type AuthUser } from "@/lib/auth"

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

type EmployeeIntakeContext = {
  branch: string
  department: string
}

async function getEmployeeIntakeContext(user: AuthUser): Promise<EmployeeIntakeContext> {
  let branch = user.branch?.trim() ?? ""
  let department = user.department?.trim() ?? ""

  if (!branch || !department) {
    try {
      const employee = await getEmployee(user.id)
      branch = branch || employee.branch.trim()
      department = department || employee.department.trim()
      persistUserSession({
        ...user,
        branch: branch || user.branch,
        department: department || user.department,
      })
    } catch {
      // Keep the draft usable even if the profile refresh cannot complete.
    }
  }

  return { branch, department }
}

function applyEmployeeContextToDraft(
  payload: TicketIntakeDraftResponse,
  context: EmployeeIntakeContext
): TicketIntakeDraftResponse {
  const branch = payload.draft.branch?.trim() || context.branch
  const department = payload.draft.department?.trim() || context.department

  return {
    ...payload,
    draft: {
      ...payload.draft,
      branch,
      department,
    },
    follow_up_questions: [],
  }
}

export default function EmployeeReportPage() {
  const router = useRouter()
  const [message, setMessage] = useState("")
  const [draftResponse, setDraftResponse] = useState<TicketIntakeDraftResponse | null>(null)
  const [draftDialogOpen, setDraftDialogOpen] = useState(false)
  const [draft, setDraft] = useState<TicketIntakeDraft>(emptyDraft)
  const [analyzing, setAnalyzing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
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

  useEffect(() => {
    const hostname = window.location.hostname
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    const needsHttpsTunnel = window.location.protocol !== "https:" && !isLocalhost

    if (!needsHttpsTunnel) {
      return
    }

    let cancelled = false

    const redirectToNgrokTunnel = async () => {
      try {
        const response = await fetch("/api/public-app-url", { cache: "no-store" })
        if (!response.ok || cancelled) {
          return
        }

        const payload = (await response.json()) as { publicUrl?: unknown }
        if (typeof payload.publicUrl !== "string" || !payload.publicUrl.startsWith("https://")) {
          return
        }

        const nextUrl = new URL(payload.publicUrl)
        nextUrl.pathname = window.location.pathname
        nextUrl.search = window.location.search
        nextUrl.hash = window.location.hash
        window.location.replace(nextUrl.toString())
      } catch {
        // Stay on the local page if the dev tunnel is not running.
      }
    }

    void redirectToNgrokTunnel()

    return () => {
      cancelled = true
    }
  }, [])

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
      showResultDialog("error", "Describe the issue before sending.")
      return
    }

    try {
      setAnalyzing(true)
      const intakeContext = await getEmployeeIntakeContext(user)
      const payload = await createAiIntakeDraft({
        message: trimmedMessage,
        user_id: user.id,
        branch: intakeContext.branch,
        department: intakeContext.department,
        channel: "employee_text",
      })
      const contextAwarePayload = applyEmployeeContextToDraft(payload, intakeContext)

      setDraftResponse(contextAwarePayload)
      setDraft(contextAwarePayload.draft)
      setDraftDialogOpen(true)
      setMessage("")
    } catch (draftError) {
      showResultDialog(
        "error",
        draftError instanceof Error ? draftError.message : "Failed to prepare ticket draft."
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
        employee_id: user.id,
        reporter_reviewed_problem: true,
      })
      showResultDialog(
        "success",
        ticket.routing_note ?? `Ticket #${ticket.id} created and auto-routed.`,
        true
      )
      setDraftDialogOpen(false)
      setDraftResponse(null)
      setDraft(emptyDraft)
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

  return (
    <div className="space-y-6">
      <EmployeeBackButton />

      <EmployeePageHero
        title="Report Fault"
        description="Describe the issue in natural language, review the ticket draft, then confirm the final version before submission."
      />

      <Card className="mx-auto w-full max-w-[900px] rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#0072CE]/15 px-5 py-4">
          <CardTitle className="text-base font-semibold text-[#0B1F3A]">Text Intake</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-5 py-5">
          <div className="rounded-lg border border-[#9FC5EA] bg-[#F6FAFF] px-4 py-3 text-sm text-[#1F4E7A]">
            Tell the system what happened. A draft preview will open before submission.
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

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={analyzing}
              className="h-10 rounded-lg border border-[#005DA8] bg-[#0072CE] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#005DA8] focus-visible:ring-2 focus-visible:ring-[#0072CE]/40 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {analyzing ? "Sending..." : "Send"}
            </Button>
          </div>

          {draftResponse && !draftDialogOpen ? (
            <div className="flex justify-center rounded-xl border border-[#DCE8F5] bg-[#FAFCFF] px-4 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraftDialogOpen(true)}
                className="h-10 rounded-lg border-[#0072CE]/30 px-5 text-sm font-semibold text-[#0B1F3A] hover:bg-[#F0F7FF]"
              >
                Review Draft
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {draftResponse ? (
        <Dialog open={draftDialogOpen} onOpenChange={setDraftDialogOpen}>
          <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-5xl overflow-y-auto border-[#0072CE]/25 bg-transparent p-0 shadow-2xl">
            <DialogTitle className="sr-only">Ticket Draft Preview</DialogTitle>
            <AiIntakeDraftEditor
              draft={draft}
              followUpQuestions={draftResponse.follow_up_questions}
              submitting={submitting}
              submitLabel="Confirm and Submit Ticket"
              onChange={setDraft}
              onSubmit={() => void handleSubmit()}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      <AssetFaultQrScanner />

      <ActionFeedbackDialog
        open={resultDialog.open}
        status={resultDialog.status}
        message={resultDialog.message}
        onOk={handleDialogOk}
        secondaryActionLabel="Create Another Ticket"
        onSecondaryAction={handleReportAgain}
      />
    </div>
  )
}
