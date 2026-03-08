"use client"

import { useState } from "react"

import { EmployeePageHero } from "@/components/layout/EmployeePageHero"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { createTicket, sendChatMessage } from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"

type TicketPriority = "Low" | "Medium" | "High" | "Critical"

type AiTriage = {
  category: string
  priority: TicketPriority
  assignment: string
  reasoning: string
}

function normalizePriority(value: string): TicketPriority | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === "low") return "Low"
  if (normalized === "medium") return "Medium"
  if (normalized === "high") return "High"
  if (normalized === "critical") return "Critical"
  return null
}

function inferCategory(text: string): string {
  const value = text.toLowerCase()
  if (value.includes("internet") || value.includes("network") || value.includes("vpn") || value.includes("wifi")) {
    return "Network"
  }
  if (value.includes("password") || value.includes("login") || value.includes("access") || value.includes("account")) {
    return "Access Management"
  }
  if (
    value.includes("laptop") ||
    value.includes("keyboard") ||
    value.includes("mouse") ||
    value.includes("screen") ||
    value.includes("printer")
  ) {
    return "Endpoint"
  }
  if (value.includes("outlook") || value.includes("system") || value.includes("app") || value.includes("software")) {
    return "Application"
  }
  return "General IT Support"
}

function inferPriority(text: string): TicketPriority {
  const value = text.toLowerCase()
  if (
    value.includes("entire branch") ||
    value.includes("system down") ||
    value.includes("all users") ||
    value.includes("outage") ||
    value.includes("urgent")
  ) {
    return "Critical"
  }
  if (value.includes("unable to work") || value.includes("cannot work") || value.includes("blocked")) {
    return "High"
  }
  if (value.includes("slow") || value.includes("intermittent") || value.includes("delay")) {
    return "Medium"
  }
  return "Low"
}

function parseAiTriageReply(reply: string): Partial<AiTriage> {
  const jsonMatch = reply.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      const parsedPriority = typeof parsed.priority === "string" ? normalizePriority(parsed.priority) : null
      return {
        category: typeof parsed.category === "string" ? parsed.category.trim() : undefined,
        priority: parsedPriority ?? undefined,
        assignment: typeof parsed.assignment === "string" ? parsed.assignment.trim() : undefined,
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : undefined,
      }
    } catch {
      // Fallback parsing below if JSON parse fails.
    }
  }

  const priorityMatch = reply.match(/priority[:\s-]*(low|medium|high|critical)/i)
  const categoryMatch = reply.match(/category[:\s-]*([a-z /-]+)/i)
  const assignmentMatch = reply.match(/assignment[:\s-]*([a-z /-]+)/i)
  return {
    category: categoryMatch?.[1]?.trim(),
    priority: priorityMatch?.[1] ? normalizePriority(priorityMatch[1]) ?? undefined : undefined,
    assignment: assignmentMatch?.[1]?.trim(),
  }
}

async function generateAiTriage(payload: {
  title: string
  description: string
  branch: string
  department: string
}): Promise<AiTriage> {
  const rawText = `${payload.title}\n${payload.description}\n${payload.branch}\n${payload.department}`
  const fallback: AiTriage = {
    category: inferCategory(rawText),
    priority: inferPriority(rawText),
    assignment: "Admin Fault",
    reasoning: "Rule-based fallback triage applied because AI response was unavailable.",
  }

  const triagePrompt = [
    "You are an enterprise IT triage assistant for Lesotho Electricity Company (LEC).",
    "Analyze the fault report and return valid JSON only (no markdown).",
    'Use this exact shape: {"category":"...","priority":"Low|Medium|High|Critical","assignment":"Admin Fault","reasoning":"..."}',
    `Title: ${payload.title}`,
    `Description: ${payload.description}`,
    `Branch: ${payload.branch}`,
    `Department: ${payload.department}`,
  ].join("\n")

  try {
    const response = await sendChatMessage(triagePrompt)
    const parsed = parseAiTriageReply(response.reply)
    return {
      category: parsed.category || fallback.category,
      priority: parsed.priority || fallback.priority,
      assignment: parsed.assignment || "Admin Fault",
      reasoning: parsed.reasoning || "AI triage generated from the submitted fault details.",
    }
  } catch {
    return fallback
  }
}

export default function EmployeeReportPage() {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [branch, setBranch] = useState("")
  const [department, setDepartment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [triageSummary, setTriageSummary] = useState<AiTriage | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const handleCreateTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setMessage("")
    setTriageSummary(null)

    const user = getStoredUserSession()
    if (!user) {
      setError("Session expired. Please login again.")
      return
    }

    if (!title.trim()) {
      setError("Title is required.")
      return
    }

    if (!description.trim()) {
      setError("Description is required.")
      return
    }

    if (!branch.trim()) {
      setError("Branch is required.")
      return
    }

    if (!department.trim()) {
      setError("Department is required.")
      return
    }

    try {
      setSubmitting(true)
      const triage = await generateAiTriage({
        title: title.trim(),
        description: description.trim(),
        branch,
        department,
      })
      setTriageSummary(triage)

      const fullDescription = `${description.trim()}\n\nBranch: ${branch.trim()}\nDepartment: ${department.trim()}`
      const ticket = await createTicket({
        title: title.trim(),
        description: fullDescription,
        category: triage.category,
        location: branch.trim(),
        priority: triage.priority,
        employee_id: user.id,
      })
      setMessage(
        ticket.routing_note ??
          `Ticket #${ticket.id} created. AI categorized as ${triage.category}, priority ${triage.priority}, assignment ${triage.assignment}.`
      )
      setTitle("")
      setDescription("")
      setBranch("")
      setDepartment("")
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create ticket.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <EmployeePageHero
        title="Report Fault"
        description="Use the AI Help icon (available on all employee pages) for quick IT troubleshooting, then submit the manual fault form."
      />

      <Card id="manual-fault-form" className="mx-auto w-full max-w-[800px] rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#0072CE]/15 px-5 py-4">
          <CardTitle className="text-base font-semibold text-[#0B1F3A]">Manual Fault Reporting Form</CardTitle>
        </CardHeader>
        <CardContent className="px-5 py-5">
          <form className="mx-auto grid w-full max-w-[620px] grid-cols-1 gap-3.5 md:grid-cols-2" onSubmit={handleCreateTicket} autoComplete="off">
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="fault-title" className="text-sm font-medium text-[#0B1F3A]">
                Title
              </label>
              <Input
                id="fault-title"
                placeholder="Issue summary"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                autoComplete="off"
                className="h-9 border-[#0072CE]/30 text-[#0B1F3A]"
                required
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label htmlFor="fault-description" className="text-sm font-medium text-[#0B1F3A]">
                Description
              </label>
              <textarea
                id="fault-description"
                placeholder="Describe the fault and impact"
                className="min-h-20 w-full rounded-lg border border-[#0072CE]/30 px-3 py-2 text-sm text-[#0B1F3A]"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="fault-branch" className="text-sm font-medium text-[#0B1F3A]">
                Branch
              </label>
              <Input
                id="fault-branch"
                placeholder="Maseru HQ"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                autoComplete="off"
                className="h-9 border-[#0072CE]/30 text-[#0B1F3A]"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="fault-department" className="text-sm font-medium text-[#0B1F3A]">
                Department
              </label>
              <Input
                id="fault-department"
                placeholder="Operations"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                autoComplete="off"
                className="h-9 border-[#0072CE]/30 text-[#0B1F3A]"
                required
              />
            </div>

            {triageSummary ? (
              <div className="rounded-lg border border-[#0072CE]/25 bg-[#F5FAFF] p-4 md:col-span-2">
                <p className="text-sm font-semibold text-[#0B1F3A]">AI Auto-Triage</p>
                <p className="mt-1 text-sm text-[#1E3A6D]">
                  Category: <span className="font-semibold text-[#0B1F3A]">{triageSummary.category}</span> | Priority:{" "}
                  <span className="font-semibold text-[#0B1F3A]">{triageSummary.priority}</span> | Assignment:{" "}
                  <span className="font-semibold text-[#0B1F3A]">{triageSummary.assignment}</span>
                </p>
                <p className="mt-1 text-xs text-[#1E3A6D]">{triageSummary.reasoning}</p>
              </div>
            ) : null}

            {error ? <p className="md:col-span-2 text-sm text-[#D71920]">{error}</p> : null}
            {message ? <p className="md:col-span-2 text-sm text-[#007A3D]">{message}</p> : null}

            <div className="md:col-span-2 flex justify-center">
              <Button
                type="submit"
                disabled={submitting}
                className="h-10 w-full max-w-[260px] rounded-lg border border-[#005DA8] bg-[#0072CE] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#005DA8] focus-visible:ring-2 focus-visible:ring-[#0072CE]/40 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? "Analyzing and Submitting..." : "Submit Ticket"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
