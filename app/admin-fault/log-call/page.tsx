"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { AiIntakeDraftEditor } from "@/components/intake/AiIntakeDraftEditor"
import { AdminFaultBackButton } from "@/components/layout/AdminFaultBackButton"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"
import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  createAiIntakeDraft,
  createTicket,
  getEmployees,
  type Employee,
  type TicketIntakeDraft,
  type TicketIntakeDraftResponse,
} from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"

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
    return `AI call intake is confident (${confidencePercent}%). Review the structured draft and submit it when ready.`
  }
  if (payload.intake_mode === "follow_up") {
    return `AI call intake produced a draft (${confidencePercent}%), but it still needs a few confirmations before submission.`
  }
  return `AI call intake is low-confidence (${confidencePercent}%). Manual review is required before the ticket is logged.`
}

export default function AdminFaultLogCallPage() {
  const router = useRouter()

  const [callerName, setCallerName] = useState("")
  const [employeeId, setEmployeeId] = useState("")
  const [employees, setEmployees] = useState<Employee[]>([])
  const [callNotes, setCallNotes] = useState("")
  const [draftResponse, setDraftResponse] = useState<TicketIntakeDraftResponse | null>(null)
  const [draft, setDraft] = useState<TicketIntakeDraft>(emptyDraft)
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [analyzingNotes, setAnalyzingNotes] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [draftStatusMessage, setDraftStatusMessage] = useState("")
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

  useEffect(() => {
    void (async () => {
      try {
        const data = await getEmployees()
        setEmployees(data.filter((item) => item.is_active))
      } catch (loadError) {
        showResultDialog("error", loadError instanceof Error ? loadError.message : "Failed to load employees.")
      } finally {
        setLoadingEmployees(false)
      }
    })()

  }, [])

  const requireCallContext = (): boolean => {
    const user = getStoredUserSession()
    if (!user || user.role !== "admin_fault") {
      showResultDialog("error", "Admin Fault session required. Please login again.")
      return false
    }
    if (!callerName.trim()) {
      showResultDialog("error", "Caller name is required before building a draft.")
      return false
    }
    if (!employeeId) {
      showResultDialog("error", "Select the employee account for this caller first.")
      return false
    }
    return true
  }

  const applyDraftPayload = (payload: TicketIntakeDraftResponse) => {
    setDraftResponse(payload)
    setDraft(payload.draft)
  }

  const handleGenerateFromNotes = async () => {
    if (!requireCallContext()) {
      return
    }

    const trimmedNotes = callNotes.trim()
    if (!trimmedNotes) {
      showResultDialog("error", "Enter call notes before requesting an AI draft.")
      return
    }

    try {
      setAnalyzingNotes(true)
      setDraftStatusMessage("")
      const payload = await createAiIntakeDraft({
        message: trimmedNotes,
        employee_id: Number(employeeId),
        caller_name: callerName.trim(),
        channel: "admin_call_notes",
      })
      applyDraftPayload(payload)
      setDraftStatusMessage(buildAssistantSummary(payload))
    } catch (draftError) {
      showResultDialog(
        "error",
        draftError instanceof Error ? draftError.message : "Failed to prepare AI draft."
      )
    } finally {
      setAnalyzingNotes(false)
    }
  }

  const handleSubmit = async () => {
    const user = getStoredUserSession()
    if (!user || user.role !== "admin_fault") {
      showResultDialog("error", "Admin Fault session required. Please login again.")
      return
    }

    if (!callerName.trim()) {
      showResultDialog("error", "Caller name is required.")
      return
    }
    if (!employeeId) {
      showResultDialog("error", "Select the employee account for this caller.")
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
        employee_id: Number(employeeId),
        reporter_reviewed_problem: true,
        caller_name: callerName.trim(),
        logged_by_admin_id: user.id,
      })
      showResultDialog("success", ticket.routing_note ?? `Call logged as ticket #${ticket.id}.`, true)
      setCallNotes("")
      setDraftResponse(null)
      setDraft(emptyDraft)
      setDraftStatusMessage("")
    } catch (submitError) {
      showResultDialog("error", submitError instanceof Error ? submitError.message : "Failed to log call.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDialogOk = () => {
    setResultDialog((current) => ({ ...current, open: false }))
    if (shouldReturnAfterDialog) {
      router.push("/admin-fault/dashboard")
    }
  }

  const handleLogAnother = () => {
    setResultDialog((current) => ({ ...current, open: false }))
  }

  return (
    <div className="space-y-6">
      <AdminFaultBackButton />

      <EmployeePageHero
        title="Log Employee Call"
        description="Capture typed call notes, then let AI generate a structured draft before the ticket is created."
      />

      <Card className="mx-auto w-full max-w-[950px] rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#0072CE]/15 px-5 py-4">
          <CardTitle className="text-base font-semibold text-[#0B1F3A]">Call Notes to Ticket Intake</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="caller-name" className="text-sm font-medium text-[#0B1F3A]">
                Caller Name
              </label>
              <Input
                id="caller-name"
                value={callerName}
                onChange={(event) => setCallerName(event.target.value)}
                className="h-9 border-[#0072CE]/30 text-[#0B1F3A]"
                placeholder="Employee calling by phone"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="employee-account" className="text-sm font-medium text-[#0B1F3A]">
                Employee Account
              </label>
              <select
                id="employee-account"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                className="h-9 w-full rounded-md border border-[#0072CE]/30 bg-white px-3 text-sm text-[#0B1F3A]"
                disabled={loadingEmployees}
              >
                <option value="">{loadingEmployees ? "Loading employees..." : "Select employee"}</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={String(employee.id)}>
                    {employee.name} ({employee.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-[#9FC5EA] bg-[#F6FAFF] px-4 py-3 text-sm text-[#1F4E7A]">
            Use typed notes for quick intake. AI will turn the caller&apos;s report into a structured ticket draft for review.
          </div>

          <div className="space-y-2">
            <label htmlFor="call-notes" className="text-sm font-medium text-[#0B1F3A]">
              Typed Call Notes
            </label>
            <textarea
              id="call-notes"
              value={callNotes}
              onChange={(event) => setCallNotes(event.target.value)}
              className="min-h-24 w-full rounded-lg border border-[#0072CE]/30 px-3 py-2 text-sm text-[#0B1F3A]"
              placeholder="Summarize what the caller reported if you want AI to build a draft from notes."
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => void handleGenerateFromNotes()}
              disabled={analyzingNotes}
              className="h-10 rounded-lg border border-[#005DA8] bg-[#0072CE] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#005DA8] focus-visible:ring-2 focus-visible:ring-[#0072CE]/40 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {analyzingNotes ? "Drafting from Notes..." : "Create Draft from Notes"}
            </Button>
          </div>

          {draftStatusMessage ? (
            <div className="rounded-lg border border-[#9CD8C2] bg-[#EAF8F0] px-4 py-3 text-sm text-[#176B4A]">
              {draftStatusMessage}
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
          submitLabel="Confirm and Log Call"
          onChange={setDraft}
          onSubmit={() => void handleSubmit()}
        />
      ) : null}

      <ActionFeedbackDialog
        open={resultDialog.open}
        status={resultDialog.status}
        message={resultDialog.message}
        onOk={handleDialogOk}
        secondaryActionLabel="Log Another Call"
        onSecondaryAction={handleLogAnother}
      />
    </div>
  )
}
