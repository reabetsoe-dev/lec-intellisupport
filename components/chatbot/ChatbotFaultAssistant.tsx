"use client"

import { useEffect, useRef, useState } from "react"
import { Bot, MessageSquareText, SendHorizontal, User, X } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { sendChatMessage } from "@/lib/api"
import { cn } from "@/lib/utils"

type ChatMessage = {
  id: number
  role: "assistant" | "user"
  content: string
}

type ParsedAssistantReply = {
  title: string | null
  intro: string | null
  steps: string[]
  notes: string[]
}

const EXCLUDED_REPLY_PREFIXES = ["collect before escalation:", "escalation path:", "if unresolved:"]

function normalizeAccountName(name: string | undefined): string {
  return name && name.trim() ? name.trim() : "Employee"
}

function getWelcomeMessage(accountName: string): ChatMessage {
  return {
    id: 1,
    role: "assistant",
    content:
      `Welcome to LEC IntelliSupport, ${normalizeAccountName(accountName)}. Describe one IT problem, and I will return clear troubleshooting steps.`,
  }
}

function sanitizeAssistantReply(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const lowered = line.toLowerCase()
      return !EXCLUDED_REPLY_PREFIXES.some((prefix) => lowered.startsWith(prefix))
    })

  return lines.join("\n")
}

function parseAssistantReply(text: string): ParsedAssistantReply {
  const cleaned = sanitizeAssistantReply(text)
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return { title: null, intro: null, steps: [], notes: [] }
  }

  const stepsHeaderIndex = lines.findIndex((line) => line.toLowerCase().startsWith("troubleshooting steps"))
  const steps = lines
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, "").trim())
    .filter(Boolean)

  const title = lines[0] ?? null
  const nonStepLines = lines.filter((line, index) => index !== 0 && index !== stepsHeaderIndex && !/^\d+\.\s+/.test(line))
  const intro = nonStepLines[0] ?? null
  const notes = nonStepLines.slice(1)

  return { title, intro, steps, notes }
}

function AssistantReplyContent({ content }: { content: string }) {
  const parsed = parseAssistantReply(content)
  const cleaned = sanitizeAssistantReply(content)

  if (parsed.steps.length === 0) {
    return <p className="whitespace-pre-line text-sm leading-relaxed text-[#0F2C52]">{cleaned}</p>
  }

  return (
    <div className="space-y-3">
      {parsed.title ? <p className="text-sm font-semibold leading-5 text-[#0B1F3A]">{parsed.title}</p> : null}
      {parsed.intro ? <p className="text-xs leading-5 text-[#35527A]">{parsed.intro}</p> : null}
      <ol className="space-y-2">
        {parsed.steps.map((step, index) => (
          <li key={`${step}-${index}`} className="flex items-start gap-2 rounded-xl border border-[#C9DFFF] bg-[#F6FAFF] px-2.5 py-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0072CE] text-[11px] font-semibold text-white">
              {index + 1}
            </span>
            <span className="text-xs leading-5 text-[#0B1F3A]">{step}</span>
          </li>
        ))}
      </ol>
      {parsed.notes.map((note, index) => (
        <p key={`${note}-${index}`} className="text-xs leading-5 text-[#35527A]">
          {note}
        </p>
      ))}
    </div>
  )
}

type ChatbotFaultAssistantProps = {
  accountName: string
  accountId?: number
}

export function ChatbotFaultAssistant({ accountName, accountId }: ChatbotFaultAssistantProps) {
  const router = useRouter()
  const pathname = usePathname()
  const resolvedAccountName = normalizeAccountName(accountName)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([getWelcomeMessage(resolvedAccountName)])
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(false)
  const [showManualReportOption, setShowManualReportOption] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messageIdRef = useRef(2)
  const sessionRef = useRef(0)

  const nextMessageId = () => {
    const id = messageIdRef.current
    messageIdRef.current += 1
    return id
  }

  const resetConversation = () => {
    sessionRef.current += 1
    messageIdRef.current = 2
    setMessages([getWelcomeMessage(resolvedAccountName)])
    setDraft("")
    setLoading(false)
    setShowManualReportOption(false)
  }

  const handleToggleChat = () => {
    if (open) {
      setOpen(false)
      resetConversation()
      return
    }
    resetConversation()
    setOpen(true)
  }

  const handleCloseChat = () => {
    setOpen(false)
    resetConversation()
  }

  const openManualReporting = () => {
    handleCloseChat()
    if (pathname.startsWith("/employee/report")) {
      if (typeof window !== "undefined") {
        window.location.hash = "manual-fault-form"
        const target = document.getElementById("manual-fault-form")
        target?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
      return
    }
    router.push("/employee/report#manual-fault-form")
  }

  const handleSend = async (input?: string) => {
    const trimmed = (input ?? draft).trim()
    if (!trimmed) {
      return
    }

    const userMessage: ChatMessage = { id: nextMessageId(), role: "user", content: trimmed }
    setMessages((current) => [...current, userMessage])
    setDraft("")

    setShowManualReportOption(false)
    const requestSession = sessionRef.current

    try {
      setLoading(true)
      const response = await sendChatMessage(trimmed)
      if (sessionRef.current !== requestSession) {
        return
      }
      const cleanedReply = sanitizeAssistantReply(
        response.reply || "I could not generate a response. Please create a ticket manually."
      )
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "assistant",
          content: cleanedReply,
        },
      ])
      setShowManualReportOption(true)
    } catch (error) {
      if (sessionRef.current !== requestSession) {
        return
      }
      setShowManualReportOption(true)
      const rawMessage = error instanceof Error ? error.message : ""
      const message = rawMessage
        ? `${rawMessage} If this continues, start AI service on port 8001 and try again.`
        : "AI service is unavailable. Start AI service on port 8001, or create a ticket manually."
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "assistant",
          content: message,
        },
      ])
    } finally {
      if (sessionRef.current === requestSession) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }
  }, [messages, open])

  useEffect(() => {
    setOpen(false)
    sessionRef.current += 1
    messageIdRef.current = 2
    setMessages([getWelcomeMessage(resolvedAccountName)])
    setDraft("")
    setLoading(false)
    setShowManualReportOption(false)
  }, [resolvedAccountName, accountId])

  return (
    <div className="fixed right-5 bottom-5 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {open ? (
        <Card className="w-[94vw] max-w-[460px] overflow-hidden rounded-3xl border-[#0072CE]/25 bg-white/95 py-0 shadow-[0_20px_55px_rgba(7,42,96,0.3)] backdrop-blur">
          <CardHeader className="border-b border-white/30 bg-gradient-to-r from-[#0A4EA8] via-[#0072CE] to-[#0091EA] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white">
                    <MessageSquareText className="h-4 w-4" />
                  </span>
                  IT Support Chat
                </CardTitle>
                <p className="mt-1 text-xs text-[#E7F2FF]">
                  Signed in as {resolvedAccountName}. Share one problem and get clear troubleshooting steps.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-8 rounded-md p-0 text-white hover:bg-white/20 hover:text-white"
                onClick={handleCloseChat}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 bg-gradient-to-b from-[#F8FBFF] to-white p-4">
            <div className="max-h-[360px] space-y-3 overflow-y-auto rounded-2xl border border-[#C8DDFF] bg-gradient-to-b from-[#F8FBFF] via-white to-[#EDF5FF] p-3.5">
              {messages.map((message) => (
                <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "flex max-w-[92%] gap-2 rounded-2xl px-3 py-2.5 text-sm shadow-sm",
                      message.role === "user"
                        ? "bg-gradient-to-r from-[#0072CE] to-[#005DA8] text-white"
                        : "border border-[#C8DDFF] bg-white text-[#0B1F3A]"
                    )}
                  >
                    <span className="pt-0.5">
                      {message.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </span>
                    {message.role === "assistant" ? (
                      <AssistantReplyContent content={message.content} />
                    ) : (
                      <p className="whitespace-pre-line leading-relaxed">{message.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {loading ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-lg border border-[#0072CE]/15 bg-white px-3 py-2 text-sm text-[#0B1F3A] shadow-sm">
                    <Bot className="h-4 w-4" />
                    <span className="font-medium text-[#1E3A6D]">Thinking</span>
                    <span className="flex items-center gap-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-[#0072CE] animate-pulse"
                        style={{ animationDelay: "0ms", animationDuration: "1100ms" }}
                      />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-[#0072CE] animate-pulse"
                        style={{ animationDelay: "250ms", animationDuration: "1100ms" }}
                      />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-[#0072CE] animate-pulse"
                        style={{ animationDelay: "500ms", animationDuration: "1100ms" }}
                      />
                    </span>
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex items-center gap-2">
              <Input
                placeholder="Describe one IT problem (example: Outlook not sending)"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={loading}
                className="h-10 border-[#94C1F2] bg-white text-[#0B1F3A] placeholder:text-[#5077A8]"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !loading) {
                    void handleSend()
                  }
                }}
              />
              <Button
                type="button"
                onClick={() => void handleSend()}
                disabled={loading}
                className="h-10 rounded-lg bg-gradient-to-r from-[#0072CE] to-[#005DA8] px-3 text-sm font-semibold text-white hover:from-[#0067BA] hover:to-[#004F8F]"
              >
                {loading ? "..." : "Send"}
                <SendHorizontal className="h-4 w-4" />
              </Button>
            </div>
            {showManualReportOption ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={openManualReporting}
                  className="h-9 rounded-lg border border-[#D71920]/20 bg-[#D71920] px-3 text-xs font-semibold text-white hover:bg-[#B1121A]"
                >
                  Not solved? Report manually
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <button
        type="button"
        onClick={handleToggleChat}
        className="group flex items-center gap-2 rounded-full border border-[#0072CE]/25 bg-[#0072CE] px-4 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-[#005DA8]"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
          <MessageSquareText className="h-4 w-4" />
        </span>
        <span>Chat</span>
      </button>
    </div>
  )
}
