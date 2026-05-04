"use client"

import { useEffect, useMemo, useState } from "react"
import { CornerDownRight, MessageSquareReply, ShieldEllipsis } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { type TicketMessage } from "@/lib/api"
import { cn } from "@/lib/utils"

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "N/A"
  }
  return date.toLocaleString()
}

function renderMessageContent(content: string) {
  const parts = content.split(/(@[A-Za-z0-9._-]+)/g)
  return parts.map((part, index) => {
    if (!part.startsWith("@")) {
      return <span key={`${part}-${index}`}>{part}</span>
    }
    return (
      <span
        key={`${part}-${index}`}
        className="rounded bg-[#DBEEFF] px-1 py-0.5 font-semibold text-[#0A4A8A]"
      >
        {part}
      </span>
    )
  })
}

type TicketConversationThreadProps = {
  messages: Array<
    TicketMessage & {
      clientStatus?: "sending" | "sent" | "failed"
      clientId?: string
      clientError?: string
    }
  >
  currentUserId: number
  onReply: (message: TicketMessage) => void
  onRetryFailedMessage?: (clientId: string) => void
  emptyState: string
  variant?: "main" | "discussion"
}

function flattenMessages(
  nodes: TicketConversationThreadProps["messages"]
): TicketConversationThreadProps["messages"] {
  const out: TicketConversationThreadProps["messages"] = []

  const visit = (node: (typeof nodes)[number]) => {
    out.push(node)
    for (const child of node.children) {
      // children come from backend as TicketMessage; we treat them as chat messages for rendering
      visit(child as (typeof nodes)[number])
    }
  }

  for (const node of nodes) {
    visit(node)
  }

  return out
}

function chatBubbleClassName(isCurrentUser: boolean) {
  return isCurrentUser
    ? "bg-[#dcf8c6] text-[#173a2b]"
    : "bg-[#f1f5f9] text-[#243b53]"
}

function noteBlockClassName(isCurrentUser: boolean) {
  // Notes should not look like chat bubbles; keep them distinct and softer.
  return isCurrentUser ? "bg-[#fff6d9] border-[#E3D4A0]" : "bg-[#f8fafc] border-[#E3D4A0]"
}

function isRetryableFailedMessage(message: TicketConversationThreadProps["messages"][number]) {
  return message.clientStatus === "failed" && typeof message.clientId === "string" && message.clientId.length > 0
}

export function TicketConversationThread({
  messages,
  currentUserId,
  onReply,
  onRetryFailedMessage,
  emptyState,
  variant = "main",
}: TicketConversationThreadProps) {
  const flattenedAndSorted = useMemo(() => {
    const flat = flattenMessages(messages)

    flat.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    // Deduplicate by backend id once local optimistic messages get replaced with server messages.
    const byKey = new Map<string, TicketConversationThreadProps["messages"][number]>()
    for (const msg of flat) {
      const key = `${msg.message_type}:${msg.id}`
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, msg)
        continue
      }

      // Prefer messages carrying clientStatus (so sending/failed UI remains visible).
      if (!existing.clientStatus && msg.clientStatus) {
        byKey.set(key, msg)
      }
    }
    return Array.from(byKey.values())
  }, [messages])

  const groupedMessages = flattenedAndSorted

  const [animateIn, setAnimateIn] = useState(false)
  const lastMessageKey = groupedMessages.length
    ? `${groupedMessages[groupedMessages.length - 1].message_type}:${groupedMessages[groupedMessages.length - 1].id}:${groupedMessages[groupedMessages.length - 1].created_at}`
    : "empty"

  useEffect(() => {
    // Trigger a subtle fade+slide animation when the newest message changes.
    setAnimateIn(false)
    const rafId = window.requestAnimationFrame(() => setAnimateIn(true))
    return () => window.cancelAnimationFrame(rafId)
  }, [lastMessageKey])

  if (groupedMessages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <CornerDownRight className="h-5 w-5 text-slate-400" />
        <p className="mt-2 text-sm font-semibold text-slate-600">Start the conversation</p>
        <p className="mt-1 text-xs text-gray-400">{emptyState}</p>
      </div>
    )
  }

  const GROUP_WINDOW_MS = 2 * 60 * 1000

  return (
    <div className="flex flex-col">
      {groupedMessages.map((message, idx) => {
        const isCurrentUser = message.sender.id === currentUserId
        const isNote = message.message_type === "INTERNAL_NOTE"

        const prev = idx > 0 ? groupedMessages[idx - 1] : null
        const timeDiffMs =
          prev && prev.created_at && message.created_at
            ? Math.abs(new Date(message.created_at).getTime() - new Date(prev.created_at).getTime())
            : Infinity

        const canGroup =
          !isNote &&
          prev &&
          prev.message_type === message.message_type &&
          prev.sender.id === message.sender.id &&
          timeDiffMs <= GROUP_WINDOW_MS

        const showSenderName = !canGroup
        const topSpacingClass = idx === 0 ? "mt-0" : canGroup ? "mt-1" : "mt-3"

        const clientStatus = message.clientStatus
        const canReply =
          !message.clientStatus || message.clientStatus === "sent"

        const isLast = idx === groupedMessages.length - 1
        const animClass = isLast
          ? animateIn
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-2"
          : "opacity-100 translate-y-0"

        if (isNote) {
          return (
            <div
              key={`${message.message_type}:${message.id}`}
              className={cn(
                "w-full translate-y-0 transition-all duration-200",
                topSpacingClass,
                "flex justify-start",
                animClass
              )}
            >
              <div
                className={cn(
                  "w-full max-w-[65%] rounded-2xl border px-4 py-2 shadow-sm",
                  noteBlockClassName(isCurrentUser)
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-[#5b4300]">{message.sender.name}</p>
                    <Badge className="border-0 bg-black/10 text-[11px] text-[#5b4300] hover:bg-black/10">
                      <ShieldEllipsis className="mr-1 h-3 w-3" />
                      Internal note
                    </Badge>
                  </div>
                  <p className="text-[10px] text-gray-400">{formatDateTime(message.created_at)}</p>
                </div>

                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#4b5563]">
                  {renderMessageContent(message.content)}
                </div>

                {(clientStatus || isRetryableFailedMessage(message)) && (
                  <div className="mt-2 flex items-center justify-end gap-2">
                    {clientStatus === "sending" ? (
                      <span className="text-[10px] text-slate-500">sending…</span>
                    ) : null}
                    {clientStatus === "sent" ? (
                      <span className="text-[10px] text-slate-400">sent</span>
                    ) : null}
                    {isRetryableFailedMessage(message) ? (
                      <>
                        <span className="text-[10px] font-semibold text-rose-600">failed</span>
                        {onRetryFailedMessage ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-auto px-2 py-0 text-[11px] text-rose-600 transition-transform active:scale-95 hover:bg-rose-50 hover:shadow-sm"
                            onClick={() => onRetryFailedMessage(message.clientId!)}
                          >
                            Retry
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                )}

                {canReply ? (
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onReply(message)}
                      className="h-auto px-2 py-0 text-[11px] text-slate-600 opacity-0 transition-opacity transition-transform group-hover:opacity-100 group-focus-within:opacity-100 group-hover:scale-105 hover:bg-transparent hover:text-slate-800"
                    >
                      <MessageSquareReply className="mr-1 h-3.5 w-3.5" />
                      Reply
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          )
        }

        return (
          <div
            key={`${message.message_type}:${message.id}`}
            className={cn("w-full flex", topSpacingClass, animClass, "transition-all duration-200")}
          >
            <div className={cn("group flex w-full", isCurrentUser ? "justify-end" : "justify-start")}>
              <div className={cn("w-full max-w-[65%]")}>
                <div className={cn("rounded-2xl px-4 py-2 shadow-sm", chatBubbleClassName(isCurrentUser))}>
                  {showSenderName ? (
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-inherit/80">{message.sender.name}</p>
                      {message.message_type === "DISCUSSION" ? (
                        <Badge variant="outline" className="border-0 bg-black/5 text-[11px] text-inherit">
                          Discussion
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="whitespace-pre-wrap text-sm leading-6">{renderMessageContent(message.content)}</div>

                  <div className={cn("mt-1 flex items-center gap-2", isCurrentUser ? "justify-end" : "justify-start")}>
                    <p className="text-[10px] text-gray-400">{formatDateTime(message.created_at)}</p>

                    {clientStatus === "sending" ? <span className="text-[10px] text-slate-500">sending…</span> : null}
                    {clientStatus === "sent" ? <span className="text-[10px] text-slate-400">sent</span> : null}
                    {clientStatus === "failed" ? <span className="text-[10px] font-semibold text-rose-600">failed</span> : null}

                    {isRetryableFailedMessage(message) && onRetryFailedMessage ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={cn(
                          "h-auto px-2 py-0 text-[11px] text-rose-600 transition-transform active:scale-95 hover:bg-rose-50 hover:shadow-sm",
                          canReply ? "" : "ml-2"
                        )}
                        onClick={() => onRetryFailedMessage(message.clientId!)}
                      >
                        Retry
                      </Button>
                    ) : null}

                    {canReply ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onReply(message)}
                        className="h-auto px-2 py-0 text-[11px] text-slate-500 opacity-0 transition-opacity transition-transform group-hover:opacity-100 group-focus-within:opacity-100 group-hover:scale-105 hover:bg-transparent hover:text-slate-700"
                      >
                        <MessageSquareReply className="mr-1 h-3.5 w-3.5" />
                        Reply
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
