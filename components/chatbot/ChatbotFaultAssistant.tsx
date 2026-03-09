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

function normalizeAccountName(name: string | undefined): string {
  return name && name.trim() ? name.trim() : "Employee"
}

function getWelcomeMessage(accountName: string): ChatMessage {
  return {
    id: 1,
    role: "assistant",
    content:
      `Welcome to LEC IntelliSupport, ${normalizeAccountName(accountName)}. Please describe your IT issue and I will guide you with practical troubleshooting steps.`,
  }
}

function isNegativeResolution(text: string): boolean {
  const value = text.trim().toLowerCase()
  if (!value) return false

  const noPatterns = [
    "no",
    "nope",
    "not solved",
    "still not",
    "still broken",
    "not fixed",
    "unresolved",
    "issue persists",
    "did not work",
    "didn't work",
    "does not work",
    "doesn't work",
    "cannot",
    "can't",
    "failed",
    "same issue",
  ]

  return noPatterns.some((pattern) => value.includes(pattern))
}

function isPositiveResolution(text: string): boolean {
  const value = text.trim().toLowerCase()
  if (!value) return false

  const yesPatterns = [
    "yes",
    "yep",
    "yeah",
    "solved",
    "resolved",
    "fixed",
    "working now",
    "works now",
    "it works",
    "done",
    "all good",
  ]

  return yesPatterns.some((pattern) => value.includes(pattern))
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
  const [awaitingResolution, setAwaitingResolution] = useState(false)
  const [showManualReportOption, setShowManualReportOption] = useState(false)
  const [showCloseOption, setShowCloseOption] = useState(false)
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
    setAwaitingResolution(false)
    setShowManualReportOption(false)
    setShowCloseOption(false)
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

    if (awaitingResolution) {
      if (isNegativeResolution(trimmed)) {
        setAwaitingResolution(false)
        setShowManualReportOption(true)
        setShowCloseOption(false)
        setMessages((current) => [
          ...current,
          {
            id: nextMessageId(),
            role: "assistant",
            content:
              "Thanks for confirming. Since the issue is not solved, you can report it manually now and we will route it to the support team.",
          },
        ])
        return
      }

      if (isPositiveResolution(trimmed)) {
        setAwaitingResolution(false)
        setShowManualReportOption(false)
        setShowCloseOption(true)
        setMessages((current) => [
          ...current,
          {
            id: nextMessageId(),
            role: "assistant",
            content: "Great. I am glad it is resolved. If another issue comes up, message me anytime.",
          },
        ])
        return
      }

      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "assistant",
          content: "Please reply with Yes if the issue is solved, or No if it is still not solved.",
        },
      ])
      return
    }

    setShowManualReportOption(false)
    setShowCloseOption(false)
    const requestSession = sessionRef.current

    try {
      setLoading(true)
      const response = await sendChatMessage(trimmed)
      if (sessionRef.current !== requestSession) {
        return
      }
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "assistant",
          content: response.reply || "I could not generate a response. Please create a ticket manually.",
        },
        {
          id: nextMessageId(),
          role: "assistant",
          content: "Did this solve your issue? Please reply Yes or No.",
        },
      ])
      setAwaitingResolution(true)
    } catch (error) {
      if (sessionRef.current !== requestSession) {
        return
      }
      setAwaitingResolution(false)
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
    setAwaitingResolution(false)
    setShowManualReportOption(false)
    setShowCloseOption(false)
  }, [resolvedAccountName, accountId])

  return (
    <div className="fixed right-5 bottom-5 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {open ? (
        <Card className="w-[92vw] max-w-[420px] rounded-2xl border-[#0072CE]/30 bg-white py-0 shadow-2xl">
          <CardHeader className="border-b border-[#0072CE]/15 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#0B1F3A]">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0072CE] text-white">
                    <MessageSquareText className="h-4 w-4" />
                  </span>
                  AI Help Chatboard
                </CardTitle>
                <p className="mt-1 text-xs text-[#1E3A6D]">
                  Signed in as {resolvedAccountName}. Quick IT solutions before manual fault reporting.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-8 rounded-md p-0 text-[#1E3A6D] hover:bg-[#EAF3FF] hover:text-[#0B1F3A]"
                onClick={handleCloseChat}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div className="max-h-[320px] space-y-3 overflow-y-auto rounded-xl border border-[#0072CE]/20 bg-gradient-to-b from-[#F7FBFF] to-[#EEF5FF] p-3.5">
              {messages.map((message) => (
                <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "flex max-w-[90%] gap-2 rounded-lg px-3 py-2 text-sm shadow-sm",
                      message.role === "user" ? "bg-[#0072CE] text-white" : "border border-[#0072CE]/15 bg-white text-[#0B1F3A]"
                    )}
                  >
                    <span className="pt-0.5">
                      {message.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </span>
                    <p>{message.content}</p>
                  </div>
                </div>
              ))}
              {loading ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-lg border border-[#0072CE]/15 bg-white px-3 py-2 text-sm text-[#0B1F3A] shadow-sm">
                    <Bot className="h-4 w-4" />
                    <span className="font-medium text-[#1E3A6D] animate-pulse">Thinking</span>
                    <span className="flex items-center gap-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-[#0072CE] animate-bounce"
                        style={{ animationDelay: "0ms", animationDuration: "900ms" }}
                      />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-[#0072CE] animate-bounce"
                        style={{ animationDelay: "150ms", animationDuration: "900ms" }}
                      />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-[#0072CE] animate-bounce"
                        style={{ animationDelay: "300ms", animationDuration: "900ms" }}
                      />
                    </span>
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex items-center gap-2">
              <Input
                placeholder="Type your IT issue..."
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={loading}
                className="h-10 border-[#0072CE]/30 text-[#0B1F3A]"
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
                className="h-10 rounded-lg bg-[#0072CE] px-3 text-sm font-semibold text-white hover:bg-[#005DA8]"
              >
                {loading ? "..." : "Send"}
                <SendHorizontal className="h-4 w-4" />
              </Button>
            </div>
            {awaitingResolution ? (
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => void handleSend("Yes, solved")}
                  className="h-8 border-[#007A3D]/30 bg-[#EAF8F0] px-3 text-xs font-semibold text-[#007A3D] hover:bg-[#DDF3E7]"
                >
                  Yes, Solved
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => void handleSend("No, still not solved")}
                  className="h-8 border-[#D71920]/30 bg-[#FFECEF] px-3 text-xs font-semibold text-[#B1121A] hover:bg-[#FFDDE1]"
                >
                  No, Not Solved
                </Button>
              </div>
            ) : null}
            {showManualReportOption ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={openManualReporting}
                  className="h-9 rounded-lg border border-[#D71920]/20 bg-[#D71920] px-3 text-xs font-semibold text-white hover:bg-[#B1121A]"
                >
                  Report Issue Manually
                </Button>
              </div>
            ) : null}
            {showCloseOption ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleCloseChat}
                  variant="outline"
                  className="h-9 rounded-lg border border-[#0072CE]/35 bg-white px-3 text-xs font-semibold text-[#0B1F3A] hover:bg-[#EAF3FF]"
                >
                  Close Chat
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
        <span>AI Help</span>
      </button>
    </div>
  )
}
