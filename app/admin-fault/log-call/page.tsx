"use client"

import { useEffect, useRef, useState } from "react"
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
  createVoiceTicketDraft,
  getEmployees,
  type Employee,
  type TicketIntakeDraft,
  type TicketIntakeDraftResponse,
  type VoiceTicketDraftResponse,
} from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"

type BrowserSpeechRecognitionResultItem = {
  transcript: string
}

type BrowserSpeechRecognitionResult = {
  isFinal: boolean
  0: BrowserSpeechRecognitionResultItem
}

type BrowserSpeechRecognitionEvent = {
  resultIndex: number
  results: BrowserSpeechRecognitionResult[]
}

type BrowserSpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  start: () => void
  stop: () => void
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognitionInstance

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
  }
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
    return `AI call intake is confident (${confidencePercent}%). Review the structured draft and submit it when ready.`
  }
  if (payload.intake_mode === "follow_up") {
    return `AI call intake produced a draft (${confidencePercent}%), but it still needs a few confirmations before submission.`
  }
  return `AI call intake is low-confidence (${confidencePercent}%). Manual review is required before the ticket is logged.`
}

export default function AdminFaultLogCallPage() {
  const router = useRouter()
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<BrowserSpeechRecognitionInstance | null>(null)

  const [callerName, setCallerName] = useState("")
  const [employeeId, setEmployeeId] = useState("")
  const [employees, setEmployees] = useState<Employee[]>([])
  const [callNotes, setCallNotes] = useState("")
  const [transcript, setTranscript] = useState("")
  const [draftResponse, setDraftResponse] = useState<TicketIntakeDraftResponse | null>(null)
  const [draft, setDraft] = useState<TicketIntakeDraft>(emptyDraft)
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [analyzingNotes, setAnalyzingNotes] = useState(false)
  const [uploadingVoice, setUploadingVoice] = useState(false)
  const [recording, setRecording] = useState(false)
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

    return () => {
      recognitionRef.current?.stop()
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop()
      }
    }
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

  const applyDraftPayload = (payload: TicketIntakeDraftResponse | VoiceTicketDraftResponse) => {
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

  const stopSpeechRecognition = () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
  }

  const startSpeechRecognition = () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) {
      return
    }

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"
    recognition.onresult = (event) => {
      let nextTranscript = ""
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        nextTranscript += event.results[index][0].transcript
      }
      setTranscript(nextTranscript.trim())
    }
    recognition.onerror = () => {
      stopSpeechRecognition()
    }
    recognition.start()
    recognitionRef.current = recognition
  }

  const uploadRecordedAudio = async (audioBlob: Blob) => {
    try {
      setUploadingVoice(true)
      setDraftStatusMessage("")
      const payload = await createVoiceTicketDraft({
        audio: audioBlob,
        employee_id: Number(employeeId),
        caller_name: callerName.trim(),
        transcript_hint: transcript.trim(),
      })
      applyDraftPayload(payload)
      setTranscript(payload.transcript)
      setDraftStatusMessage(buildAssistantSummary(payload))
    } catch (voiceError) {
      showResultDialog(
        "error",
        voiceError instanceof Error ? voiceError.message : "Failed to convert call audio into a ticket draft."
      )
    } finally {
      setUploadingVoice(false)
    }
  }

  const handleStartRecording = async () => {
    if (!requireCallContext()) {
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordedChunksRef.current = []
      setTranscript("")

      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const audioBlob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        })
        recordedChunksRef.current = []
        mediaRecorderRef.current = null
        void uploadRecordedAudio(audioBlob)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
      startSpeechRecognition()
    } catch (recordError) {
      showResultDialog(
        "error",
        recordError instanceof Error ? recordError.message : "Unable to start audio recording."
      )
    }
  }

  const handleStopRecording = () => {
    stopSpeechRecognition()
    if (!mediaRecorderRef.current) {
      return
    }
    setRecording(false)
    mediaRecorderRef.current.stop()
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
      setTranscript("")
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
        description="Capture typed call notes or record the call, then let AI generate a structured draft before the ticket is created."
      />

      <Card className="mx-auto w-full max-w-[950px] rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#0072CE]/15 px-5 py-4">
          <CardTitle className="text-base font-semibold text-[#0B1F3A]">Voice to Ticket Intake</CardTitle>
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
            Use typed notes for quick intake or record the call for a voice-driven draft. Voice transcription uses a browser transcript when available and falls back safely when it is not.
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
              disabled={analyzingNotes || recording || uploadingVoice}
              className="h-10 rounded-lg border border-[#005DA8] bg-[#0072CE] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#005DA8] focus-visible:ring-2 focus-visible:ring-[#0072CE]/40 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {analyzingNotes ? "Drafting from Notes..." : "Create Draft from Notes"}
            </Button>

            {!recording ? (
              <Button
                type="button"
                onClick={() => void handleStartRecording()}
                disabled={uploadingVoice || analyzingNotes}
                className="h-10 rounded-lg border border-[#8A1C1C] bg-[#B71C1C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#931515] focus-visible:ring-2 focus-visible:ring-[#B71C1C]/40 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Start Call Recording
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleStopRecording}
                className="h-10 rounded-lg border border-[#8A1C1C] bg-[#D32F2F] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#B71C1C] focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40"
              >
                Stop Recording and Draft
              </Button>
            )}
          </div>

          {recording ? (
            <div className="rounded-lg border border-[#EDB0B0] bg-[#FFEAEA] px-4 py-3 text-sm text-[#8A2D2D]">
              Recording in progress. Stop the recording when the caller has finished speaking.
            </div>
          ) : null}

          {uploadingVoice ? (
            <div className="rounded-lg border border-[#9FC5EA] bg-[#F6FAFF] px-4 py-3 text-sm text-[#1F4E7A]">
              Uploading the recording and generating an AI draft...
            </div>
          ) : null}

          {draftStatusMessage ? (
            <div className="rounded-lg border border-[#9CD8C2] bg-[#EAF8F0] px-4 py-3 text-sm text-[#176B4A]">
              {draftStatusMessage}
            </div>
          ) : null}

          {transcript ? (
            <div className="rounded-lg border border-[#DCE8F5] bg-[#FAFCFF] px-4 py-3">
              <p className="text-sm font-semibold text-[#0B1F3A]">Latest Transcript</p>
              <p className="mt-2 text-sm text-[#1F4E7A]">{transcript}</p>
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
