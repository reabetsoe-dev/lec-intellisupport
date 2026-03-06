"use client"

import { useState } from "react"
import { Bot, SendHorizontal, User } from "lucide-react"

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

export function ChatbotFaultAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      content:
        "Hi, I am IntelliSupport AI. Describe your issue and I will suggest a fix before creating a ticket.",
    },
  ])
  const [draft, setDraft] = useState("")
  const [unresolved, setUnresolved] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      return
    }

    const userMessage: ChatMessage = { id: Date.now(), role: "user", content: trimmed }
    setMessages((current) => [...current, userMessage])
    setDraft("")
    setUnresolved(false)

    try {
      setLoading(true)
      const response = await sendChatMessage(trimmed)
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: response.reply || "I could not generate a response. Please create a ticket manually.",
        },
      ])
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : ""
      const message = rawMessage
        ? `${rawMessage} If this continues, start AI service on port 8001 and try again.`
        : "AI service is unavailable. Start AI service on port 8001, or create a ticket manually."
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: message,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 px-6 py-5">
        <CardTitle className="text-base font-semibold text-slate-900">AI Chatbot Fault Reporting</CardTitle>
        <p className="text-sm text-slate-500">Resolve issues faster before manual ticket creation.</p>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        <div className="max-h-[360px] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
          {messages.map((message) => (
            <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "flex max-w-[88%] gap-2 rounded-lg px-3 py-2 text-sm shadow-sm",
                  message.role === "user" ? "bg-slate-900 text-white" : "bg-white text-slate-700"
                )}
              >
                <span className="pt-0.5">
                  {message.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </span>
                <p>{message.content}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Describe your issue..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={loading}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !loading) {
                handleSend()
              }
            }}
          />
          <Button onClick={handleSend} disabled={loading} className="bg-slate-900 text-white hover:bg-slate-800">
            {loading ? "Sending..." : "Send"}
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-800">Did this solve your issue?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              onClick={() => setUnresolved(false)}
            >
              Yes, solved
            </Button>
            <Button
              variant="outline"
              className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              onClick={() => setUnresolved(true)}
            >
              No, still unresolved
            </Button>
          </div>

          {unresolved ? (
            <Button asChild className="mt-3 bg-slate-900 text-white hover:bg-slate-800">
              <a href="#manual-fault-form">Create Ticket Manually</a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
