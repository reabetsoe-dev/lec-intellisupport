"use client"

import { useMemo } from "react"
import { AtSign, CornerDownRight, MessageSquarePlus, UserPlus2, Users, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type MentionableUser, type TicketMessage, type TicketMessageType } from "@/lib/api"
import { cn } from "@/lib/utils"

const mentionTriggerPattern = /(^|\s)@([A-Za-z0-9._-]*)$/

function renderMentionPreview(content: string) {
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

type TicketMessageComposerProps = {
  className?: string
  draft: string
  onDraftChange: (value: string) => void
  onSubmit: () => void
  submitting: boolean
  placeholder: string
  mentionableUsers: MentionableUser[]
  submitLabel: string
  messageType?: TicketMessageType
  messageTypeOptions?: Array<{ value: TicketMessageType; label: string }>
  onMessageTypeChange?: (value: TicketMessageType) => void
  replyTarget?: TicketMessage | null
  onCancelReply?: () => void
  disabled?: boolean
  modeLabel?: string
  tone?: "reply" | "note" | "discussion"
  textareaId?: string
  onInviteToDiscussion?: () => void
}

type MentionSuggestion =
  | { kind: "user"; user: MentionableUser }
  | { kind: "discussion" }
  | { kind: "invite" }

function toneClasses(tone: "reply" | "note" | "discussion") {
  if (tone === "note") {
    return {
      shell: "bg-transparent",
      indicator: "bg-[#fff4d1] text-[#7A5700]",
      textarea:
        "border-[#e5d2ab] bg-white text-[#5B4300] focus:border-[#C49A2E] focus:ring-[#C49A2E]/20",
      preview: "bg-[#FFF9EC]",
      button: "bg-[#7A5700] text-white hover:bg-[#604400]",
    }
  }

  if (tone === "discussion") {
    return {
      shell: "bg-transparent",
      indicator: "bg-[#e5e7eb] text-[#374151]",
      textarea:
        "border-[#d1d5db] bg-white text-[#114933] focus:border-[#1C7C54] focus:ring-[#1C7C54]/20",
      preview: "bg-[#f8fafc]",
      button: "bg-[#1f7a3f] text-white hover:bg-[#196433]",
    }
  }

  return {
    shell: "bg-transparent",
    indicator: "bg-[#dcf8c6] text-[#1f7a3f]",
    textarea:
      "border-[#d1d5db] bg-white text-[#173A5D] focus:border-[#1f7a3f] focus:ring-[#1f7a3f]/20",
    preview: "bg-[#f8fafc]",
    button: "bg-[#1f7a3f] text-white hover:bg-[#196433]",
  }
}

export function TicketMessageComposer({
  className,
  draft,
  onDraftChange,
  onSubmit,
  submitting,
  placeholder,
  mentionableUsers,
  submitLabel,
  messageType,
  messageTypeOptions,
  onMessageTypeChange,
  replyTarget,
  onCancelReply,
  disabled = false,
  modeLabel,
  tone = "reply",
  textareaId,
  onInviteToDiscussion,
}: TicketMessageComposerProps) {
  const toneStyle = toneClasses(tone)
  const mentionMatch = draft.match(mentionTriggerPattern)
  const mentionQuery = mentionMatch?.[2]?.toLowerCase() ?? ""

  const mentionSuggestions = useMemo(() => {
    if (!mentionMatch) {
      return []
    }

    const suggestions: MentionSuggestion[] = []
    if (tone === "discussion") {
      if (!mentionQuery || "discussion".includes(mentionQuery)) {
        suggestions.push({ kind: "discussion" })
      }
      if (onInviteToDiscussion && (!mentionQuery || "invite".includes(mentionQuery) || "email".includes(mentionQuery))) {
        suggestions.push({ kind: "invite" })
      }
    }

    const userSuggestions = mentionableUsers
      .filter((user) => {
        if (!mentionQuery) {
          return true
        }
        const haystack = `${user.name} ${user.email} ${user.mention_handle}`.toLowerCase()
        return haystack.includes(mentionQuery)
      })
      .map((user) => ({ kind: "user", user }) as MentionSuggestion)
      .slice(0, 6)
    return [...suggestions, ...userSuggestions]
  }, [mentionMatch, mentionQuery, mentionableUsers, onInviteToDiscussion, tone])

  const handleInsertMention = (user: MentionableUser) => {
    if (!mentionMatch) {
      return
    }
    const nextValue = draft.replace(mentionTriggerPattern, `${mentionMatch[1]}@${user.mention_handle} `)
    onDraftChange(nextValue)
  }

  const handleInsertDiscussionMention = () => {
    if (!mentionMatch) {
      return
    }
    const nextValue = draft.replace(mentionTriggerPattern, `${mentionMatch[1]}@discussion `)
    onDraftChange(nextValue)
  }

  return (
    <div className={cn("space-y-3", toneStyle.shell, className)}>
      {modeLabel ? (
        <div>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide",
              toneStyle.indicator
            )}
          >
            {modeLabel}
          </span>
        </div>
      ) : null}

      {messageTypeOptions && messageType && onMessageTypeChange ? (
        <div className="flex flex-wrap gap-2">
          {messageTypeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onMessageTypeChange(option.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                messageType === option.value
                  ? "border-[#0A63B8] bg-[#E7F3FF] text-[#0A4A8A]"
                  : "border-[#D3DEEA] bg-[#F7FAFD] text-[#46698E]"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {replyTarget ? (
        <div className="flex items-start justify-between gap-3 rounded-2xl bg-[#f8fafc] px-3 py-2">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#4A6F95]">
              <CornerDownRight className="h-3.5 w-3.5" />
              Replying To
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-[#1D4267]">{replyTarget.sender.name}</p>
            <p className="truncate text-xs text-[#55789F]">{replyTarget.content}</p>
          </div>
          {onCancelReply ? (
            <Button type="button" variant="outline" size="sm" onClick={onCancelReply}>
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="relative">
        <div className="flex items-end gap-3 rounded-[28px] bg-white p-2 shadow-sm ring-1 ring-slate-200">
          <textarea
            id={textareaId}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={placeholder}
            disabled={disabled || submitting}
            onKeyDown={(event) => {
              // WhatsApp-style: Enter sends, Shift+Enter adds a newline.
              if (event.key === "Enter" && !event.shiftKey) {
                if (disabled || submitting) {
                  return
                }
                event.preventDefault()
                onSubmit()
              }
            }}
            className={cn(
              "min-h-[52px] max-h-40 w-full resize-none rounded-[24px] border px-4 py-3 text-sm outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-70",
              toneStyle.textarea,
              "transition-all focus:ring-2 focus:ring-green-400 focus:border-green-400"
            )}
          />
          <Button
            type="button"
            onClick={onSubmit}
            disabled={disabled || submitting || !draft.trim()}
            className={cn(
              "h-11 rounded-full px-5 shadow-none transition-transform active:scale-95 hover:brightness-110 hover:shadow-[0_0_0_4px_rgba(16,185,129,0.18)]",
              toneStyle.button,
              tone === "note" ? "hover:bg-[#604400]" : "hover:bg-green-600"
            )}
          >
            {submitting ? "Sending..." : submitLabel}
          </Button>
        </div>

        {mentionSuggestions.length > 0 ? (
          <div className="absolute left-3 right-3 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border border-[#C8D7E8] bg-white shadow-xl">
            <div className="border-b border-[#E1EAF3] bg-[#F7FBFF] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#5A7CA0]">
              Mention Someone
            </div>
            <div className="max-h-56 overflow-y-auto p-2">
              {mentionSuggestions.map((suggestion, index) => {
                if (suggestion.kind === "discussion") {
                  return (
                    <button
                      key={`discussion-${index}`}
                      type="button"
                      onClick={handleInsertDiscussionMention}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-[#EEF6FF]"
                    >
                      <span>
                        <p className="text-sm font-semibold text-[#173A5D]">@discussion</p>
                        <p className="text-xs text-[#5A7CA0]">Notify everyone already in this discussion.</p>
                      </span>
                      <Users className="h-4 w-4 text-[#5A7CA0]" />
                    </button>
                  )
                }

                if (suggestion.kind === "invite") {
                  return (
                    <button
                      key={`invite-${index}`}
                      type="button"
                      onClick={() => onInviteToDiscussion?.()}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-[#EEF6FF]"
                    >
                      <span>
                        <p className="text-sm font-semibold text-[#173A5D]">Invite to discussion</p>
                        <p className="text-xs text-[#5A7CA0]">Add a teammate by email and bring them into this thread.</p>
                      </span>
                      <UserPlus2 className="h-4 w-4 text-[#5A7CA0]" />
                    </button>
                  )
                }

                return (
                  <button
                    key={suggestion.user.id}
                    type="button"
                    onClick={() => handleInsertMention(suggestion.user)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-[#EEF6FF]"
                  >
                    <span>
                      <p className="text-sm font-semibold text-[#173A5D]">{suggestion.user.name}</p>
                      <p className="text-xs text-[#5A7CA0]">@{suggestion.user.mention_handle} - {suggestion.user.role.replace("_", " ")}</p>
                    </span>
                    <AtSign className="h-4 w-4 text-[#5A7CA0]" />
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      {draft.includes("@") ? (
        <div className={cn("rounded-2xl px-3 py-2", toneStyle.preview)}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#5A7CA0]">
            Mention Preview
          </p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-[#24486E]">{renderMentionPreview(draft)}</p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-xs text-[#5A7CA0]">
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Type <span className="font-semibold">@username</span> to mention staff members{tone === "discussion" ? ", or " : "."}
          {tone === "discussion" ? <span className="font-semibold">@discussion</span> : null}
          {tone === "discussion" ? " to notify everyone." : null}
        </p>
      </div>
    </div>
  )
}
