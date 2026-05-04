"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { AiIntakeDraftEditor } from "@/components/intake/AiIntakeDraftEditor"
import { EmployeeBackButton } from "@/components/layout/EmployeeBackButton"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"
import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createAiIntakeDraft, createTicket, type TicketIntakeDraft, type TicketIntakeDraftResponse } from "@/lib/api"
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
    </div>
  )
}
