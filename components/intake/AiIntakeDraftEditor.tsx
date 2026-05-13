"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type TicketIntakeDraft, type TicketIntakeMode } from "@/lib/api"
import { BRANCH_OPTIONS, DEPARTMENT_OPTIONS } from "@/lib/organization-options"

type AiIntakeDraftEditorProps = {
  draft: TicketIntakeDraft
  confidence: number
  intakeMode: TicketIntakeMode
  followUpQuestions: string[]
  submitting: boolean
  submitLabel: string
  onChange: (nextDraft: TicketIntakeDraft) => void
  onSubmit: () => void
}

const categoryOptions = ["Hardware", "Software", "Network", "Security"] as const
const priorityOptions = ["Low", "Medium", "High", "Critical"] as const

function confidenceBannerClass(mode: TicketIntakeMode): string {
  if (mode === "direct") {
    return "border-[#9CD8C2] bg-[#EAF8F0] text-[#176B4A]"
  }
  if (mode === "follow_up") {
    return "border-[#E5D2AB] bg-[#FFF9EC] text-[#7A5700]"
  }
  return "border-[#EDB0B0] bg-[#FFEAEA] text-[#8A2D2D]"
}

function confidenceMessage(mode: TicketIntakeMode, confidence: number): string {
  const percent = Math.round(confidence * 100)
  if (mode === "direct") {
    return `AI intake is confident (${percent}%). Review the draft and submit.`
  }
  if (mode === "follow_up") {
    return `AI intake needs a little confirmation (${percent}%). Review the follow-up prompts and adjust the draft before submitting.`
  }
  return `AI intake is low-confidence (${percent}%). Manual review is required before submission.`
}

export function AiIntakeDraftEditor({
  draft,
  confidence,
  intakeMode,
  followUpQuestions,
  submitting,
  submitLabel,
  onChange,
  onSubmit,
}: AiIntakeDraftEditorProps) {
  return (
    <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-[#0072CE]/15 px-5 py-4">
        <CardTitle className="text-base font-semibold text-[#0B1F3A]">AI Ticket Draft Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-5 py-5">
        <div className={`rounded-lg border px-4 py-3 text-sm ${confidenceBannerClass(intakeMode)}`}>
          {confidenceMessage(intakeMode, confidence)}
        </div>

        {followUpQuestions.length > 0 ? (
          <div className="rounded-lg border border-[#E5D2AB] bg-[#FFF9EC] px-4 py-3">
            <p className="text-sm font-semibold text-[#7A5700]">Follow-up Questions</p>
            <ul className="mt-2 space-y-1 text-sm text-[#7A5700]">
              {followUpQuestions.map((question) => (
                <li key={question}>- {question}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label htmlFor="ai-draft-title" className="text-sm font-medium text-[#0B1F3A]">
              Title
            </label>
            <Input
              id="ai-draft-title"
              value={draft.title}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
              className="h-9 border-[#0072CE]/30 text-[#0B1F3A]"
              placeholder="Issue summary"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="ai-draft-description" className="text-sm font-medium text-[#0B1F3A]">
              Description
            </label>
            <textarea
              id="ai-draft-description"
              value={draft.description}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
              className="min-h-24 w-full rounded-lg border border-[#0072CE]/30 px-3 py-2 text-sm text-[#0B1F3A]"
              placeholder="Describe the issue"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="ai-draft-branch" className="text-sm font-medium text-[#0B1F3A]">
              Branch
            </label>
            <select
              id="ai-draft-branch"
              value={draft.branch ?? ""}
              onChange={(event) => onChange({ ...draft, branch: event.target.value })}
              className="h-9 w-full rounded-md border border-[#0072CE]/30 bg-white px-3 text-sm text-[#0B1F3A]"
            >
              <option value="">Select branch</option>
              {BRANCH_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="ai-draft-department" className="text-sm font-medium text-[#0B1F3A]">
              Department
            </label>
            <select
              id="ai-draft-department"
              value={draft.department ?? ""}
              onChange={(event) => onChange({ ...draft, department: event.target.value })}
              className="h-9 w-full rounded-md border border-[#0072CE]/30 bg-white px-3 text-sm text-[#0B1F3A]"
            >
              <option value="">Select department</option>
              {DEPARTMENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="ai-draft-category" className="text-sm font-medium text-[#0B1F3A]">
              Category
            </label>
            <select
              id="ai-draft-category"
              value={draft.category}
              onChange={(event) => onChange({ ...draft, category: event.target.value })}
              className="h-9 w-full rounded-md border border-[#0072CE]/30 bg-white px-3 text-sm text-[#0B1F3A]"
            >
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="ai-draft-priority" className="text-sm font-medium text-[#0B1F3A]">
              Priority
            </label>
            <select
              id="ai-draft-priority"
              value={draft.priority}
              onChange={(event) => onChange({ ...draft, priority: event.target.value })}
              className="h-9 w-full rounded-md border border-[#0072CE]/30 bg-white px-3 text-sm text-[#0B1F3A]"
            >
              {priorityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="ai-draft-asset" className="text-sm font-medium text-[#0B1F3A]">
              Affected Asset
            </label>
            <Input
              id="ai-draft-asset"
              value={draft.asset ?? ""}
              onChange={(event) => onChange({ ...draft, asset: event.target.value })}
              className="h-9 border-[#0072CE]/30 text-[#0B1F3A]"
              placeholder="Printer, laptop, Outlook, VPN..."
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="ai-draft-impact" className="text-sm font-medium text-[#0B1F3A]">
              Business Impact
            </label>
            <Input
              id="ai-draft-impact"
              value={draft.impact ?? ""}
              onChange={(event) => onChange({ ...draft, impact: event.target.value })}
              className="h-9 border-[#0072CE]/30 text-[#0B1F3A]"
              placeholder="Single user, team blocked, recurring..."
            />
          </div>
        </div>

        <div className="flex justify-center">
          <Button
            type="button"
            disabled={submitting}
            onClick={onSubmit}
            className="h-10 w-full max-w-[280px] rounded-lg border border-[#005DA8] bg-[#0072CE] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#005DA8] focus-visible:ring-2 focus-visible:ring-[#0072CE]/40 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Submitting..." : submitLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
