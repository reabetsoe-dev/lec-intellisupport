"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  PauseCircle,
  Shield,
  UserPlus2,
  Users,
} from "lucide-react"

import { TicketConversationThread } from "@/components/tickets/TicketConversationThread"
import { TicketMessageComposer } from "@/components/tickets/TicketMessageComposer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  addDiscussionParticipant,
  createTicketMessage,
  escalateTicket,
  getTechnicians,
  getTicketById,
  getTicketMessages,
  submitTicketProblemReview,
  type Technician,
  type TicketDetail,
  type TicketMessage,
  type TicketMessageType,
  type TicketMessagesResponse,
  updateTicketPriority,
  updateTicketStatus,
} from "@/lib/api"
import { getStoredUserSession, type AuthUser, type UserRole } from "@/lib/auth"
import { cn } from "@/lib/utils"

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "N/A"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "N/A"
  }
  return date.toLocaleString()
}

function formatTrackingId(id: number): string {
  return `TK-${String(id).padStart(5, "0")}`
}

function normalizeTicketStatus(status: string): string {
  const normalized = status.trim().toLowerCase()
  if (normalized === "open" || normalized === "pending vendor" || normalized === "pending") {
    return "Pending"
  }
  if (normalized === "escalated" || normalized === "in progress" || normalized === "in process") {
    return "In Progress"
  }
  if (normalized === "pending review" || normalized === "awaiting review") {
    return "Pending Review"
  }
  if (normalized === "resolved" || normalized === "solved") {
    return "Solved"
  }
  return status
}

function isTicketAccessErrorMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase()
  return normalized.includes("access denied") || normalized.includes("ticket not found") || normalized.includes("not found")
}

function statusBadgeClass(status: string): string {
  if (status === "Pending") {
    return "border-[#E2C079] bg-[#FFF7E1] text-[#8A5A00]"
  }
  if (status === "In Progress") {
    return "border-[#9FC5EA] bg-[#EAF5FF] text-[#1F4E7A]"
  }
  if (status === "Pending Review") {
    return "border-[#D9BC7D] bg-[#FFF6E4] text-[#8A5A00]"
  }
  return "border-[#9AD0B1] bg-[#EAF8F0] text-[#1E6A40]"
}

function statusMeta(status: string): { icon: typeof Clock3; waitingFor: string } {
  if (status === "Pending") {
    return { icon: Clock3, waitingFor: "Technician acceptance" }
  }
  if (status === "In Progress") {
    return { icon: Clock3, waitingFor: "Technician work completion" }
  }
  if (status === "Pending Review") {
    return { icon: PauseCircle, waitingFor: "Reporter confirmation" }
  }
  return { icon: CheckCircle2, waitingFor: "No pending action" }
}

const slaTargetHoursByPriority: Record<string, number> = {
  Critical: 4,
  High: 8,
  Medium: 24,
  Low: 48,
}

function parseDateMs(value?: string | null): number | null {
  if (!value) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function formatHoursForLabel(hours: number): string {
  const positiveHours = Math.max(0, Math.ceil(hours))
  if (positiveHours >= 24) {
    return `${Math.ceil(positiveHours / 24)}d`
  }
  return `${positiveHours}h`
}

function ticketSlaLabel(ticket: TicketDetail, status: string): { label: string; urgent: boolean } {
  if (status === "Solved") {
    return { label: "Completed", urgent: false }
  }

  const referenceMs =
    parseDateMs(ticket.last_activity_at) ??
    parseDateMs(ticket.accepted_at) ??
    parseDateMs(ticket.assigned_at) ??
    parseDateMs(ticket.created_at) ??
    parseDateMs(ticket.updated_at)
  const elapsedHours = referenceMs ? Math.max(0, (Date.now() - referenceMs) / (1000 * 60 * 60)) : 0
  const remainingHours = (slaTargetHoursByPriority[ticket.priority] ?? 24) - elapsedHours

  if (remainingHours <= 0) {
    return { label: `Overdue by ${formatHoursForLabel(Math.abs(remainingHours))}`, urgent: true }
  }
  return { label: `${formatHoursForLabel(remainingHours)} remaining`, urgent: remainingHours <= 2 }
}

function isCheckedInTechnician(technician: Technician): boolean {
  if (typeof technician.checked_in === "boolean") {
    return technician.checked_in
  }
  if (!technician.is_available || !technician.last_check_in_at) {
    return false
  }
  if (!technician.last_check_out_at) {
    return true
  }
  return new Date(technician.last_check_in_at).getTime() >= new Date(technician.last_check_out_at).getTime()
}

function getTransferCandidates(technicians: Technician[], currentUserId: number): Technician[] {
  const activeTechnicians = technicians.filter((item) => item.user_id !== currentUserId && item.is_active)
  const checkedInTechnicians = activeTechnicians.filter((item) => item.is_available && isCheckedInTechnician(item))
  return checkedInTechnicians.length > 0 ? checkedInTechnicians : activeTechnicians
}

function workflowActionState(status: string): {
  label: "Start Work" | "Mark Resolved" | "Waiting for Employee Review" | "Completed"
  nextStatus: "In Progress" | "Solved" | null
  disabled: boolean
  tone: "start" | "resolve" | "waiting" | "complete"
} {
  if (status === "Pending") {
    return { label: "Start Work", nextStatus: "In Progress", disabled: false, tone: "start" }
  }
  if (status === "In Progress") {
    return { label: "Mark Resolved", nextStatus: "Solved", disabled: false, tone: "resolve" }
  }
  if (status === "Pending Review") {
    return { label: "Waiting for Employee Review", nextStatus: null, disabled: true, tone: "waiting" }
  }
  return { label: "Completed", nextStatus: null, disabled: true, tone: "complete" }
}

function filterMessageTree(
  messages: TicketMessage[],
  predicate: (message: TicketMessage) => boolean
): TicketMessage[] {
  const filtered: TicketMessage[] = []

  for (const message of messages) {
    const children = filterMessageTree(message.children, predicate)

    if (predicate(message)) {
      filtered.push({ ...message, children })
      continue
    }

    filtered.push(...children)
  }

  return filtered
}

function focusComposerById(id: string) {
  if (typeof window === "undefined") {
    return
  }

  window.requestAnimationFrame(() => {
    const element = document.getElementById(id)
    if (!element) {
      return
    }
    element.scrollIntoView({ behavior: "smooth", block: "center" })
    element.focus()
  })
}

function actionButtonClass(active: boolean, tone: "reply" | "note" | "discussion") {
  if (tone === "note") {
    return active
      ? "border-[#D7C48B] bg-[#FFF4D1] text-[#7A5700]"
      : "border-[#E8D7AB] bg-white text-[#7A5700] hover:bg-[#FFF9EC]"
  }

  if (tone === "discussion") {
    return active
      ? "border-[#9BCDBA] bg-[#E0F6E9] text-[#176B4A]"
      : "border-[#BEE3CF] bg-white text-[#176B4A] hover:bg-[#F3FBF6]"
  }

  return active
    ? "border-[#9FC5EA] bg-[#EAF5FF] text-[#0A4A8A]"
    : "border-[#BFD1E4] bg-white text-[#0A4A8A] hover:bg-[#F7FBFF]"
}

type ReplyTargetState = {
  lane: "reply" | "internal_note" | "discussion"
  message: TicketMessage
} | null

type FlashState = {
  type: "success" | "error"
  message: string
} | null

type ClientMessageStatus = "sending" | "sent" | "failed"

type TicketChatMessage = TicketMessage & {
  clientStatus?: ClientMessageStatus
  clientId?: string
  clientError?: string
  clientRetryPayload?: {
    message_type: TicketMessageType
    content: string
    parent_message_id?: number | null
  }
}

type TicketConversationWorkspaceProps = {
  ticketId: number
  viewerRole?: UserRole
}

const conversationSectionId = "conversation-section"

export function TicketConversationWorkspace({ ticketId, viewerRole }: TicketConversationWorkspaceProps) {
  const [currentUser] = useState<AuthUser | null>(() => getStoredUserSession())
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [conversation, setConversation] = useState<TicketMessagesResponse | null>(null)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [flash, setFlash] = useState<FlashState>(null)

  const [replyDraft, setReplyDraft] = useState("")
  const [replySubmitting, setReplySubmitting] = useState(false)

  const [internalDraft, setInternalDraft] = useState("")
  const [internalSubmitting, setInternalSubmitting] = useState(false)
  const [internalComposerMode, setInternalComposerMode] = useState<TicketMessageType>("DISCUSSION")
  const [conversationView, setConversationView] = useState<"main" | "internal">("main")
  const [replyTarget, setReplyTarget] = useState<ReplyTargetState>(null)

  const [participantUserId, setParticipantUserId] = useState("")
  const [showParticipantPicker, setShowParticipantPicker] = useState(false)
  const [addingParticipant, setAddingParticipant] = useState(false)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [participantEmail, setParticipantEmail] = useState("")
  const [participantEmailError, setParticipantEmailError] = useState("")
  const [solvedConfirmOpen, setSolvedConfirmOpen] = useState(false)

  const [autoStarting, setAutoStarting] = useState(false)
  const [workflowBusy, setWorkflowBusy] = useState(false)
  const [priorityValue, setPriorityValue] = useState("Medium")
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [escalationComment, setEscalationComment] = useState("")
  const [escalationTarget, setEscalationTarget] = useState("")
  const [reviewRating, setReviewRating] = useState("")
  const [reviewComment, setReviewComment] = useState("")
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reviewModalMode, setReviewModalMode] = useState<"confirm" | "reopen">("confirm")
  const mainScrollRef = useRef<HTMLDivElement | null>(null)
  const internalScrollRef = useRef<HTMLDivElement | null>(null)
  const mainBottomRef = useRef<HTMLDivElement | null>(null)
  const internalBottomRef = useRef<HTMLDivElement | null>(null)

  const [clientMessages, setClientMessages] = useState<TicketChatMessage[]>([])
  const paneKeyRef = useRef<"main" | "discussion" | "notes">("main")
  const autoStartAttemptedRef = useRef<number | null>(null)

  const focusConversationSection = () => {
    if (typeof window === "undefined") {
      return
    }

    const section = document.getElementById(conversationSectionId)
    if (!section) {
      return
    }

    section.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })

    if (section instanceof HTMLElement) {
      section.focus()
    }
  }

  useEffect(() => {
    if (!flash) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setFlash(null)
    }, 4000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [flash])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    if (window.location.hash !== `#${conversationSectionId}`) {
      return
    }

    window.requestAnimationFrame(() => {
      focusConversationSection()
    })
  }, [loading, loadError, ticketId])

  const resolvedRole = currentUser?.role ?? viewerRole ?? null
  const isStaffRole = Boolean(resolvedRole && resolvedRole !== "employee")
  const canViewInternal = isStaffRole
  const canManageParticipants = Boolean(conversation?.permissions.can_manage_discussion_participants)
  const canPostReply = Boolean(conversation?.permissions.can_post_reply)
  const canPostInternalNote = isStaffRole || Boolean(conversation?.permissions.can_post_internal_note)
  const canPostDiscussion = isStaffRole || Boolean(conversation?.permissions.can_post_discussion)
  const detailStatus = ticket ? normalizeTicketStatus(ticket.status) : "Pending"
  const isAssignedTechnician =
    Boolean(ticket) && currentUser?.role === "technician" && ticket?.technician_user_id === currentUser?.id
  const previousStatusRef = useRef<string>(detailStatus)

  const statusInfo = useMemo(() => statusMeta(detailStatus), [detailStatus])
  const StatusIcon = statusInfo.icon

  const systemMessages = useMemo<TicketChatMessage[]>(() => {
    if (!ticket) {
      return []
    }
    const messages: TicketChatMessage[] = []
    const nowIso = new Date().toISOString()
    messages.push({
      id: -1000 - ticket.id,
      ticket_id: ticket.id,
      sender: { id: 0, name: "System", role: "manager", email: "", mention_handle: "system" },
      message_type: "REPLY",
      content: `[SYSTEM] Waiting for: ${statusInfo.waitingFor}.`,
      parent_message_id: null,
      is_internal: false,
      created_at: ticket.updated_at ?? nowIso,
      mention_tokens: [],
      children: [],
    })
    if (detailStatus === "Pending Review") {
      messages.push({
        id: -2000 - ticket.id,
        ticket_id: ticket.id,
        sender: { id: 0, name: "System", role: "manager", email: "", mention_handle: "system" },
        message_type: "REPLY",
        content: "[SYSTEM] Resolution submitted. Reporter review is required before closure.",
        parent_message_id: null,
        is_internal: false,
        created_at: ticket.updated_at ?? nowIso,
        mention_tokens: [],
        children: [],
      })
    }
    const lifecycleMessages = [...(ticket.comments ?? [])]
      .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
      .map((comment, index): TicketChatMessage => ({
        id: -300000 - ticket.id * 1000 - index,
        ticket_id: ticket.id,
        sender: { id: 0, name: "System", role: "manager", email: "", mention_handle: "system" },
        message_type: "REPLY",
        content: `[SYSTEM] ${comment.comment}`,
        parent_message_id: null,
        is_internal: false,
        created_at: comment.created_at,
        mention_tokens: [],
        children: [],
      }))
    return [...lifecycleMessages, ...messages]
  }, [ticket, detailStatus, statusInfo.waitingFor])

  const loadWorkspace = useCallback(async (viewer: AuthUser) => {
    const [ticketPayload, conversationPayload, technicianPayload] = await Promise.all([
      getTicketById(ticketId),
      getTicketMessages(ticketId),
      viewer.role === "technician" ? getTechnicians({ reassignForTicketId: ticketId }) : Promise.resolve([]),
    ])
    setTicket(ticketPayload)
    setConversation(conversationPayload)
    setPriorityValue(ticketPayload.priority)
    setTechnicians(getTransferCandidates(technicianPayload, viewer.id))
  }, [ticketId])

  useEffect(() => {
    if (!currentUser) {
      return
    }
    const run = async () => {
      try {
        setLoading(true)
        await loadWorkspace(currentUser)
        setLoadError("")
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load ticket conversation.")
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [currentUser, loadWorkspace])

  const replyThread = useMemo(
    () => filterMessageTree(conversation?.main_thread ?? [], (message) => message.message_type === "REPLY"),
    [conversation?.main_thread]
  )

  const discussionThread = useMemo(
    () =>
      filterMessageTree(conversation?.discussion_thread ?? [], (message) => message.message_type === "DISCUSSION"),
    [conversation?.discussion_thread]
  )

  const internalNoteThread = useMemo(
    () => {
      const fromMain = filterMessageTree(
        conversation?.main_thread ?? [],
        (message) => message.message_type === "INTERNAL_NOTE"
      )
      const fromDiscussion = filterMessageTree(
        conversation?.discussion_thread ?? [],
        (message) => message.message_type === "INTERNAL_NOTE"
      )
      return [...fromMain, ...fromDiscussion]
    },
    [conversation?.main_thread, conversation?.discussion_thread]
  )

  const clientMainMessages = useMemo(
    () => clientMessages.filter((m) => m.message_type === "REPLY"),
    [clientMessages]
  )

  const clientDiscussionMessages = useMemo(
    () => clientMessages.filter((m) => m.message_type === "DISCUSSION"),
    [clientMessages]
  )

  const clientInternalNoteMessages = useMemo(
    () => clientMessages.filter((m) => m.message_type === "INTERNAL_NOTE"),
    [clientMessages]
  )

  const mainRenderMessages = useMemo(
    () => [...systemMessages, ...replyThread, ...clientMainMessages],
    [systemMessages, replyThread, clientMainMessages]
  )

  const discussionRenderMessages = useMemo(
    () => [...discussionThread, ...clientDiscussionMessages],
    [discussionThread, clientDiscussionMessages]
  )

  const internalNoteRenderMessages = useMemo(
    () => [...internalNoteThread, ...clientInternalNoteMessages],
    [internalNoteThread, clientInternalNoteMessages]
  )

  const refreshConversationOnly = async () => {
    const payload = await getTicketMessages(ticketId)
    setConversation(payload)
  }

  const generateClientId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID()
    }
    return `client_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }

  const refreshAll = useCallback(async () => {
    if (!currentUser) {
      return
    }
    await loadWorkspace(currentUser)
  }, [currentUser, loadWorkspace])

  useEffect(() => {
    if (!ticket || !currentUser || currentUser.role !== "technician" || !isAssignedTechnician) {
      return
    }

    const normalizedStatus = normalizeTicketStatus(ticket.status)
    if (normalizedStatus !== "Pending") {
      autoStartAttemptedRef.current = null
      return
    }
    if (workflowBusy || autoStarting || autoStartAttemptedRef.current === ticket.id) {
      return
    }

    autoStartAttemptedRef.current = ticket.id
    let isCurrent = true

    const autoOpenTicket = async () => {
      try {
        setAutoStarting(true)
        const updatedTicket = await updateTicketStatus(ticket.id, "In Progress", undefined, currentUser.id)
        setTicket((current) => (current && current.id === updatedTicket.id ? { ...current, ...updatedTicket } : current))
        console.info("[workflow] auto-started technician ticket", {
          ticketId: ticket.id,
          returnedStatus: updatedTicket.status,
          workflowState: updatedTicket.workflow_state,
        })
        if (isCurrent) {
          setFlash({
            type: "success",
            message: "Ticket opened and moved to In Progress automatically.",
          })
        }
      } catch (error) {
        console.warn("[workflow] auto-start failed; manual Start Work remains available", error)
      } finally {
        if (!isCurrent) {
          return
        }
        try {
          await refreshAll()
        } catch (error) {
          setLoadError(error instanceof Error ? error.message : "Failed to refresh ticket conversation.")
        } finally {
          setAutoStarting(false)
        }
      }
    }

    void autoOpenTicket()

    return () => {
      isCurrent = false
    }
  }, [autoStarting, currentUser, isAssignedTechnician, refreshAll, ticket, workflowBusy])

  const applyDiscussionMention = (mentionHandle: string) => {
    const mention = `@${mentionHandle}`
    setInternalDraft((current) => {
      if (current.includes(mention)) {
        return current
      }
      return current.trim() ? `${current.trimEnd()}\n${mention} ` : `${mention} `
    })
  }

  const activateReplyComposer = () => {
    setConversationView("main")
    if (replyTarget?.lane !== "reply") {
      setReplyTarget(null)
    }
    focusComposerById("ticket-reply-composer")
  }

  const activateInternalComposer = (mode: "INTERNAL_NOTE" | "DISCUSSION") => {
    setConversationView("internal")
    setInternalComposerMode(mode)
    if (
      replyTarget &&
      ((mode === "INTERNAL_NOTE" && replyTarget.lane !== "internal_note") ||
        (mode === "DISCUSSION" && replyTarget.lane !== "discussion"))
    ) {
      setReplyTarget(null)
    }
    focusComposerById("ticket-internal-composer")
  }

  const handleReplySubmit = async () => {
    if (!currentUser) {
      return
    }

    const trimmed = replyDraft.trim()
    if (!trimmed) {
      return
    }

    const parent_message_id =
      replyTarget?.lane === "reply" ? replyTarget.message.id : undefined
    const clientId = generateClientId()
    const tempId = -Date.now() - Math.floor(Math.random() * 100000)

    const optimisticMessage: TicketChatMessage = {
      id: tempId,
      ticket_id: ticketId,
      sender: {
        id: currentUser.id,
        name: currentUser.name,
        role: currentUser.role,
        email: "",
        mention_handle: "",
      },
      message_type: "REPLY",
      content: trimmed,
      parent_message_id: parent_message_id ?? null,
      is_internal: false,
      created_at: new Date().toISOString(),
      mention_tokens: [],
      children: [],
      clientStatus: "sending",
      clientId,
      clientRetryPayload: {
        message_type: "REPLY",
        content: trimmed,
        parent_message_id: parent_message_id ?? null,
      },
    }

    try {
      setReplySubmitting(true)

      setClientMessages((current) => [...current, optimisticMessage])
      setReplyDraft("")
      setReplyTarget((current) => (current?.lane === "reply" ? null : current))

      const serverMessage = await createTicketMessage(ticketId, {
        message_type: "REPLY",
        content: trimmed,
        parent_message_id: parent_message_id,
      })

      setClientMessages((current) =>
        current.map((msg) =>
          msg.clientId === clientId
            ? {
                ...serverMessage,
                clientStatus: "sent",
                clientId,
              }
            : msg
        )
      )

      setFlash({ type: "success", message: "Reply sent successfully." })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send message."
      setClientMessages((current) =>
        current.map((msg) => (msg.clientId === clientId ? { ...msg, clientStatus: "failed", clientError: message } : msg))
      )
      setFlash({ type: "error", message })
    } finally {
      setReplySubmitting(false)
    }
  }

  const handleInternalSubmit = async () => {
    if (!currentUser) {
      return
    }

    const trimmed = internalDraft.trim()
    if (!trimmed) {
      return
    }

    const messageType = internalComposerMode
    const expectedParentLane = messageType === "DISCUSSION" ? "discussion" : "internal_note"
    const parent_message_id =
      replyTarget?.lane === expectedParentLane ? replyTarget.message.id : undefined
    const clientId = generateClientId()
    const tempId = -Date.now() - Math.floor(Math.random() * 100000)

    const optimisticMessage: TicketChatMessage = {
      id: tempId,
      ticket_id: ticketId,
      sender: {
        id: currentUser.id,
        name: currentUser.name,
        role: currentUser.role,
        email: "",
        mention_handle: "",
      },
      message_type: messageType,
      content: trimmed,
      parent_message_id: parent_message_id ?? null,
      is_internal: true,
      created_at: new Date().toISOString(),
      mention_tokens: [],
      children: [],
      clientStatus: "sending",
      clientId,
      clientRetryPayload: {
        message_type: messageType,
        content: trimmed,
        parent_message_id: parent_message_id ?? null,
      },
    }

    try {
      setInternalSubmitting(true)
      setClientMessages((current) => [...current, optimisticMessage])
      setInternalDraft("")
      setReplyTarget((current) =>
        current?.lane === expectedParentLane ? null : current
      )

      const serverMessage = await createTicketMessage(ticketId, {
        message_type: messageType,
        content: trimmed,
        parent_message_id: parent_message_id,
      })

      setClientMessages((current) =>
        current.map((msg) =>
          msg.clientId === clientId
            ? {
                ...serverMessage,
                clientStatus: "sent",
                clientId,
              }
            : msg
        )
      )

      setFlash({
        type: "success",
        message:
          messageType === "DISCUSSION"
            ? "Discussion message posted successfully."
            : "Internal note added successfully.",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send internal message."
      setClientMessages((current) =>
        current.map((msg) =>
          msg.clientId === clientId ? { ...msg, clientStatus: "failed", clientError: message } : msg
        )
      )
      setFlash({
        type: "error",
        message,
      })
    } finally {
      setInternalSubmitting(false)
    }
  }

  const retryFailedClientMessage = async (clientId: string) => {
    const current = clientMessages.find((m) => m.clientId === clientId)
    const retryPayload = current?.clientRetryPayload
    if (!current || !retryPayload || current.clientStatus !== "failed") {
      return
    }

    setClientMessages((messages) =>
      messages.map((msg) =>
        msg.clientId === clientId ? { ...msg, clientStatus: "sending", clientError: undefined } : msg
      )
    )

    try {
      const payload: {
        message_type: TicketMessageType
        content: string
        parent_message_id?: number | null
      } = {
        message_type: retryPayload.message_type,
        content: retryPayload.content,
      }

      if (typeof retryPayload.parent_message_id === "number") {
        payload.parent_message_id = retryPayload.parent_message_id
      }

      const serverMessage = await createTicketMessage(ticketId, payload)

      setClientMessages((messages) =>
        messages.map((msg) =>
          msg.clientId === clientId
            ? {
                ...serverMessage,
                clientStatus: "sent",
                clientId,
              }
            : msg
        )
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Retry failed."
      setClientMessages((messages) =>
        messages.map((msg) =>
          msg.clientId === clientId ? { ...msg, clientStatus: "failed", clientError: message } : msg
        )
      )
    }
  }

  const handleAddParticipant = async () => {
    if (!participantUserId) {
      return
    }
    try {
      setAddingParticipant(true)
      const participant = await addDiscussionParticipant(ticketId, { userId: Number(participantUserId) })
      setParticipantUserId("")
      await refreshConversationOnly()
      applyDiscussionMention(participant.user.mention_handle)
      setFlash({
        type: "success",
        message: `${participant.user.name} was added to the discussion.`,
      })
    } catch (error) {
      setFlash({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to add participant.",
      })
    } finally {
      setAddingParticipant(false)
    }
  }

  const handleChooseDiscussionUser = (userId: string) => {
    setConversationView("internal")
    setParticipantUserId(userId)
    setInternalComposerMode("DISCUSSION")
    setReplyTarget((current) => (current?.lane === "discussion" ? current : null))

    const selectedUser = conversation?.mentionable_users.find((user) => String(user.id) === userId)
    if (selectedUser) {
      applyDiscussionMention(selectedUser.mention_handle)
    }

    focusComposerById("ticket-internal-composer")
  }

  const handleInviteByEmail = async () => {
    const trimmedEmail = participantEmail.trim().toLowerCase()
    if (!trimmedEmail) {
      setParticipantEmailError("Email is required.")
      return
    }

    try {
      setAddingParticipant(true)
      setParticipantEmailError("")
      const participant = await addDiscussionParticipant(ticketId, { email: trimmedEmail })
      setParticipantEmail("")
      setInviteDialogOpen(false)
      await refreshConversationOnly()
      setConversationView("internal")
      setInternalComposerMode("DISCUSSION")
      applyDiscussionMention(participant.user.mention_handle)
      setFlash({
        type: "success",
        message: `${participant.user.name} was invited to this discussion.`,
      })
      focusComposerById("ticket-internal-composer")
    } catch (error) {
      setParticipantEmailError(error instanceof Error ? error.message : "Failed to invite teammate.")
    } finally {
      setAddingParticipant(false)
    }
  }

  const handleTechnicianStatusUpdate = async (nextStatus: "In Progress" | "Solved") => {
    if (!ticket || !currentUser) {
      return
    }
    if (!isAssignedTechnician || conversation?.permissions.can_perform_workflow_actions !== true) {
      setFlash({ type: "error", message: `Workflow actions belong to ${ticket.technician_name || "the assigned technician"}.` })
      return
    }
    try {
      setWorkflowBusy(true)
      const updatedTicket = await updateTicketStatus(ticket.id, nextStatus, undefined, currentUser.id)
      setTicket((current) => (current && current.id === updatedTicket.id ? { ...current, ...updatedTicket } : current))
      console.info("[workflow] technician status update", {
        ticketId: ticket.id,
        requestedStatus: nextStatus,
        returnedStatus: updatedTicket.status,
        workflowState: updatedTicket.workflow_state,
      })
      try {
        await refreshAll()
      } catch (refreshError) {
        console.warn("[workflow] status updated but refresh failed", refreshError)
      }
      setFlash({
        type: "success",
        message:
          nextStatus === "In Progress"
            ? "Work started. Ticket moved to In Progress."
            : "Ticket marked as resolved and moved to reporter review.",
      })
    } catch (error) {
      console.error("[workflow] failed to update technician status", error)
      setFlash({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to update ticket status.",
      })
    } finally {
      setWorkflowBusy(false)
    }
  }

  const handlePrioritySave = async () => {
    if (!ticket) {
      return
    }
    try {
      setWorkflowBusy(true)
      await updateTicketPriority(ticket.id, priorityValue)
      await refreshAll()
      setFlash({ type: "success", message: `Priority updated to ${priorityValue}.` })
    } catch (error) {
      setFlash({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to update priority.",
      })
    } finally {
      setWorkflowBusy(false)
    }
  }

  const handleTransferTicket = async () => {
    if (!ticket || !currentUser) {
      return
    }
    if (currentUser.role !== "technician" || !isAssignedTechnician) {
      setFlash({ type: "error", message: "Only the workflow owner can transfer this ticket." })
      return
    }
    if (!escalationTarget) {
      setFlash({ type: "error", message: "Choose a technician to receive this ticket." })
      return
    }

    try {
      setWorkflowBusy(true)
      await escalateTicket(ticket.id, currentUser.id, Number(escalationTarget), escalationComment.trim() || "Ownership transferred.")
      setEscalationComment("")
      setEscalationTarget("")
      setTransferDialogOpen(false)
      await refreshAll()
      setFlash({
        type: "success",
        message: "Ticket transferred successfully. The new owner will start from Awaiting Start.",
      })
    } catch (error) {
      setFlash({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to transfer ticket.",
      })
    } finally {
      setWorkflowBusy(false)
    }
  }

  const handleProblemReview = async (approved: boolean) => {
    if (!ticket || !currentUser) {
      return
    }
    if (!reviewRating) {
      setFlash({ type: "error", message: "Please provide a rating from 1 to 5." })
      return
    }
    if (!approved && !reviewComment.trim()) {
      setFlash({ type: "error", message: "Please explain what still needs to be fixed." })
      return
    }

    try {
      setWorkflowBusy(true)
      await submitTicketProblemReview(ticket.id, {
        reporter_id: currentUser.id,
        approved,
        rating: Number(reviewRating),
        review_comment: reviewComment.trim() || undefined,
      })
      setReviewComment("")
      setReviewRating("")
      await refreshAll()
      setFlash({
        type: "success",
        message: approved
          ? "Ticket closed after your final review."
          : "Ticket returned to In Progress for more work.",
      })
    } catch (error) {
      setFlash({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to submit final problem review.",
      })
    } finally {
      setWorkflowBusy(false)
    }
  }

  const showMainConversation = !canViewInternal || conversationView === "main"
  const showInternalConversation = canViewInternal && conversationView === "internal"
  const hasConversation = conversation !== null

  useEffect(() => {
    if (!ticket) {
      return
    }
    if (previousStatusRef.current !== detailStatus) {
      setFlash({
        type: "success",
        message: `Status updated: ${previousStatusRef.current} -> ${detailStatus}. Waiting for: ${statusInfo.waitingFor}.`,
      })
      previousStatusRef.current = detailStatus
    }
  }, [detailStatus, statusInfo.waitingFor, ticket])

  useEffect(() => {
    if (!hasConversation) {
      return
    }
    const paneKey = showMainConversation
      ? "main"
      : internalComposerMode === "DISCUSSION"
        ? "discussion"
        : "notes"
    const paneChanged = paneKeyRef.current !== paneKey
    paneKeyRef.current = paneKey

    const scrollEl = showMainConversation ? mainScrollRef.current : internalScrollRef.current
    const sentinelEl = showMainConversation ? mainBottomRef.current : internalBottomRef.current
    if (!scrollEl || !sentinelEl) {
      return
    }

    const distanceFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight
    const nearBottom = distanceFromBottom <= 100
    if (!paneChanged && !nearBottom) {
      return
    }

    sentinelEl.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [
    showMainConversation,
    showInternalConversation,
    hasConversation,
    internalComposerMode,
    mainRenderMessages.length,
    discussionRenderMessages.length,
    internalNoteRenderMessages.length,
  ])

  if (loading) {
    return (
      <div className="space-y-6">
        <div
          id={conversationSectionId}
          tabIndex={-1}
          role="region"
          aria-label="Ticket conversations"
          className="rounded-2xl border border-[#C8D7E8] bg-white p-5 outline-none"
        >
          <p className="text-sm text-slate-500">Loading ticket conversation...</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    const isTechnicianAccessError =
      resolvedRole === "technician" && isTicketAccessErrorMessage(loadError)

    return (
      <div className="space-y-6">
        <div
          id={conversationSectionId}
          tabIndex={-1}
          role="region"
          aria-label="Ticket conversations"
          className="rounded-2xl border border-[#EDB0B0] bg-white p-5 outline-none"
        >
          {isTechnicianAccessError ? (
            <div className="space-y-4">
              <div>
                <p className="text-base font-semibold text-rose-600">Ticket no longer available in your queue.</p>
                <p className="mt-2 text-sm leading-6 text-[#8A5A5A]">
                  This ticket is no longer assigned to your technician account, or it was reassigned before the detail
                  page finished loading. Open your current assigned tickets to continue working.
                </p>
              </div>
              <Button asChild className="bg-[#0A63B8] text-white hover:bg-[#084C8C]">
                <Link href="/technician/tickets">Return to Assigned Tickets</Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-rose-600">{loadError}</p>
          )}
        </div>
      </div>
    )
  }

  if (!currentUser || !ticket || !conversation) {
    return (
      <div className="space-y-6">
        <div
          id={conversationSectionId}
          tabIndex={-1}
          role="region"
          aria-label="Ticket conversations"
          className="rounded-2xl border border-[#EDB0B0] bg-white p-5 outline-none"
        >
          <p className="text-sm text-rose-600">Ticket conversation is unavailable.</p>
        </div>
      </div>
    )
  }

  const reporterName = ticket.employee_name ?? `Employee #${ticket.employee_id}`
  const workflowOwnerName = ticket.technician_name || "Unassigned"
  const slaState = ticketSlaLabel(ticket, detailStatus)
  const canUseWorkflowControls =
    currentUser.role === "technician" &&
    isAssignedTechnician &&
    conversation.permissions.can_perform_workflow_actions === true
  const primaryWorkflowAction = workflowActionState(detailStatus)
  const mainReplyTarget = replyTarget?.lane === "reply" ? replyTarget.message : null
  const activeInternalLane = internalComposerMode === "DISCUSSION" ? "discussion" : "internal_note"
  const internalReplyTarget = replyTarget?.lane === activeInternalLane ? replyTarget.message : null
  const internalComposerTone = internalComposerMode === "DISCUSSION" ? "discussion" : "note"
  const internalModeLabel = internalComposerMode === "DISCUSSION" ? "Discussion" : "Internal Note"
  const internalSubmitLabel = internalComposerMode === "DISCUSSION" ? "Post Discussion" : "Add Internal Note"
  const internalPlaceholder =
    internalComposerMode === "DISCUSSION"
      ? "Start an internal discussion, ask for help, or mention a teammate..."
      : "Add a private note for staff. This will not be visible to the employee..."
  return (
    <div className="space-y-6">
      {flash ? (
        <div
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm",
            flash.type === "success"
              ? "border-[#9CD8C2] bg-[#EAF8F0] text-[#176B4A]"
              : "border-[#EDB0B0] bg-[#FFEAEA] text-[#9D3030]"
          )}
        >
          {flash.message}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-[#B7CBE0] bg-white/95 px-3 py-3 shadow-md backdrop-blur sm:px-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[#5A7CA0]">
              <span className="shrink-0">{formatTrackingId(ticket.id)}</span>
              <span aria-hidden="true" className="text-[#93A9BE]">-</span>
              <span className={cn("inline-flex min-w-0 items-center gap-1", slaState.urgent ? "text-[#A33939]" : "text-[#24517A]")}>
                <span className={cn("h-2 w-2 rounded-full", slaState.urgent ? "bg-[#D94848]" : "bg-[#E2A22A]")} />
                {slaState.label}
              </span>
              {autoStarting ? (
                <>
                  <span aria-hidden="true">-</span>
                  <span className="inline-flex items-center gap-1 text-[#0A63B8]">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    Starting work
                  </span>
                </>
              ) : null}
            </div>
            <h2 className="mt-1 max-w-full truncate text-base font-semibold text-[#173A5D]" title={ticket.title}>
              {ticket.title}
            </h2>
            <p className="mt-1 text-sm text-[#4A6F95]">
              Assigned to: <span className="font-semibold text-[#173A5D]">{workflowOwnerName}</span>
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
            <Badge className={cn("shrink-0 rounded-full border px-3 py-1", statusBadgeClass(detailStatus))}>
              <StatusIcon className="mr-1 h-3.5 w-3.5" />
              {detailStatus}
            </Badge>
            {canUseWorkflowControls ? (
              <Button
                type="button"
                disabled={workflowBusy || autoStarting || primaryWorkflowAction.disabled}
                onClick={() => {
                  if (primaryWorkflowAction.nextStatus === "Solved") {
                    setSolvedConfirmOpen(true)
                    return
                  }
                  if (primaryWorkflowAction.nextStatus) {
                    void handleTechnicianStatusUpdate(primaryWorkflowAction.nextStatus)
                  }
                }}
                className={cn(
                  "min-h-10 min-w-[9.5rem] max-w-full whitespace-normal text-white sm:whitespace-nowrap",
                  primaryWorkflowAction.tone === "resolve"
                    ? "bg-[#1C7C54] hover:bg-[#155E40]"
                    : primaryWorkflowAction.tone === "start"
                      ? "bg-[#0A63B8] hover:bg-[#084C8C]"
                      : "bg-[#66788A] hover:bg-[#566879]"
                )}
              >
                {workflowBusy || autoStarting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                {primaryWorkflowAction.label}
              </Button>
            ) : currentUser.role === "employee" && detailStatus === "Pending Review" ? (
              <>
                <Button
                  type="button"
                  onClick={() => {
                    setReviewModalMode("confirm")
                    setReviewModalOpen(true)
                  }}
                  disabled={workflowBusy}
                  className="bg-[#1C7C54] text-white hover:bg-[#155E40]"
                >
                  Confirm Resolution
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setReviewModalMode("reopen")
                    setReviewModalOpen(true)
                  }}
                  disabled={workflowBusy}
                  className="border-[#C98F2A] bg-white text-[#8A5A00] hover:bg-[#FFF5DF]"
                >
                  Reopen Issue
                </Button>
              </>
            ) : null}

            {canUseWorkflowControls ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className="shrink-0 border-[#B8CDE1] bg-white text-[#20466D]">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[70] w-48 border-[#B8CDE1] bg-white">
                  <DropdownMenuItem
                    disabled={workflowBusy || detailStatus === "Pending Review" || detailStatus === "Solved"}
                    onClick={() => setTransferDialogOpen(true)}
                  >
                    Transfer Ticket
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
        {currentUser.role === "technician" && !isAssignedTechnician ? (
          <div className="mt-3 rounded-lg border border-[#D7E4F0] bg-[#F8FBFF] px-3 py-2 text-sm text-[#4A6F95]">
            You are collaborating on this ticket. Workflow actions belong to {workflowOwnerName}.
          </div>
        ) : null}
      </div>

      <div
        id={conversationSectionId}
        tabIndex={-1}
        role="region"
        aria-label="Ticket conversations"
        className="rounded-lg border border-[#C8D7E8] bg-white px-3 py-3 outline-none"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={activateReplyComposer}
              className={cn("border shadow-none", actionButtonClass(showMainConversation, "reply"))}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Main
            </Button>
            {canViewInternal ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => activateInternalComposer("DISCUSSION")}
                className={cn("border shadow-none", actionButtonClass(showInternalConversation, "discussion"))}
              >
                <Users className="mr-2 h-4 w-4" />
                Internal
              </Button>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5A7CA0]">
            <span className="min-w-0 truncate">Reporter: <span className="font-semibold text-[#21476D]">{reporterName}</span></span>
            <span>Priority: <span className="font-semibold text-[#21476D]">{ticket.priority}</span></span>
            <span>Category: <span className="font-semibold text-[#21476D]">{ticket.category}</span></span>
            <span>Updated: <span className="font-semibold text-[#21476D]">{formatDateTime(ticket.updated_at)}</span></span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {showMainConversation ? (
          <Card className="flex h-[calc(100vh-300px)] min-h-[520px] max-h-[760px] flex-col overflow-hidden rounded-lg border-[#D7E4F0] bg-[#efeae2] py-0 shadow-sm">
            <CardHeader className="border-b border-[#D7E4F0] bg-white/90 px-5 py-4 backdrop-blur">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#dcf8c6] text-[#1f7a3f]">
                  <MessageSquare className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-base font-semibold text-[#173A5D]">Main conversation</CardTitle>
                  <p className="text-sm text-[#5A7CA0]">
                    External replies visible to the employee.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col px-0 py-0">
              <div
                ref={mainScrollRef}
                className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-3 py-4 [scrollbar-width:thin] [scrollbar-color:#cbd5e1 transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-track]:bg-transparent"
              >
                <TicketConversationThread
                  messages={mainRenderMessages}
                  currentUserId={currentUser.id}
                  onReply={(message) => {
                    setReplyTarget({ lane: "reply", message })
                  }}
                  emptyState="No employee-visible replies yet."
                  onRetryFailedMessage={retryFailedClientMessage}
                />
                <div ref={mainBottomRef} />
              </div>

              <div className="shrink-0 border-t border-[#D7E4F0] bg-white p-3">
                <TicketMessageComposer
                  draft={replyDraft}
                  onDraftChange={setReplyDraft}
                  onSubmit={() => void handleReplySubmit()}
                  submitting={replySubmitting}
                  placeholder={canViewInternal ? "Write an employee-visible reply..." : "Reply to the support team about this ticket..."}
                  mentionableUsers={conversation.mentionable_users}
                  submitLabel={canViewInternal ? "Send" : "Send"}
                  modeLabel={canViewInternal ? "Replying to Employee" : "Replying to Support"}
                  tone="reply"
                  textareaId="ticket-reply-composer"
                  replyTarget={mainReplyTarget}
                  onCancelReply={mainReplyTarget ? () => setReplyTarget(null) : undefined}
                  disabled={workflowBusy || !canPostReply}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {showInternalConversation ? (
            <Card className="flex h-[calc(100vh-300px)] min-h-[520px] max-h-[760px] flex-col overflow-hidden rounded-lg border-[#8FA1B3] bg-[#D5DEE7] py-0 shadow-sm">
              <CardHeader className="border-b border-[#9EB0C2] bg-[#C8D3DE] px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#e8e8e8] text-[#4b5563]">
                    <Shield className="h-5 w-5" />
                  </span>
                  <div>
                    <CardTitle className="text-base font-semibold text-[#173A5D]">Internal conversation</CardTitle>
                    <p className="text-sm text-[#5A7CA0]">
                      Internal Only: staff discussion, notes, participants, and mentions.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col px-0 py-0">
                <div className="shrink-0 border-b border-[#D7E4F0] bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#173A5D]">
                        <Users className="h-4 w-4 text-[#176B4A]" />
                        Discuss with
                      </p>
                      <p className="mt-1 text-xs text-[#5A7CA0]">
                        Choose teammates only when you need to add or mention them.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowParticipantPicker((current) => !current)}
                      className="border-[#BEE3CF] bg-white text-[#176B4A] hover:bg-[#F3FBF6]"
                    >
                      <UserPlus2 className="mr-2 h-4 w-4" />
                      Choose
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setInviteDialogOpen(true)
                        setParticipantEmailError("")
                      }}
                      className="border-[#BEE3CF] bg-white text-[#176B4A] hover:bg-[#F3FBF6]"
                    >
                      <UserPlus2 className="mr-2 h-4 w-4" />
                      Invite by Email
                    </Button>
                  </div>

                  {showParticipantPicker ? (
                    <div className="mt-3 space-y-3 rounded-2xl bg-[#f8fafc] p-3">
                      <select
                        value={participantUserId}
                        onChange={(event) => handleChooseDiscussionUser(event.target.value)}
                        className="h-10 w-full rounded-xl border border-[#BFD1E4] bg-white px-3 text-sm text-[#173A5D]"
                      >
                        <option value="">Select a teammate to mention</option>
                        {conversation.mentionable_users.map((user) => (
                          <option key={user.id} value={String(user.id)}>
                            {user.name} (@{user.mention_handle})
                          </option>
                        ))}
                      </select>

                      {canManageParticipants ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            onClick={() => void handleAddParticipant()}
                            disabled={addingParticipant || !participantUserId}
                            className="bg-[#1C7C54] text-white hover:bg-[#155E40]"
                          >
                            <UserPlus2 className="mr-2 h-4 w-4" />
                            {addingParticipant ? "Adding..." : "Add to Thread"}
                          </Button>
                          <span className="text-xs text-[#5A7CA0]">
                            {conversation.participants.length} teammate{conversation.participants.length === 1 ? "" : "s"} in this thread
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div
                  ref={internalScrollRef}
                  className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-3 py-4 [scrollbar-width:thin] [scrollbar-color:#cbd5e1 transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-track]:bg-transparent"
                >
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <p className="text-sm font-semibold text-[#173A5D]">
                      {internalComposerMode === "DISCUSSION" ? "Discussion Thread" : "Internal Notes"}
                    </p>
                    <Badge
                      className={cn(
                        "border",
                        internalComposerMode === "DISCUSSION"
                          ? "border-[#9BCDBA] bg-[#E0F6E9] text-[#176B4A] hover:bg-[#E0F6E9]"
                          : "border-[#D7C48B] bg-[#FFF4D1] text-[#7A5700] hover:bg-[#FFF4D1]"
                      )}
                    >
                      {internalComposerMode === "DISCUSSION" ? "Team" : "Staff only"}
                    </Badge>
                  </div>
                  <TicketConversationThread
                    messages={
                      internalComposerMode === "DISCUSSION"
                        ? discussionRenderMessages
                        : internalNoteRenderMessages
                    }
                    currentUserId={currentUser.id}
                    onReply={(message) => {
                      const lane = internalComposerMode === "DISCUSSION" ? "discussion" : "internal_note"
                      setReplyTarget({ lane, message })
                      focusComposerById("ticket-internal-composer")
                    }}
                    emptyState={
                      internalComposerMode === "DISCUSSION"
                        ? "Start internal discussion with your team"
                        : "No internal notes yet."
                    }
                    variant={internalComposerMode === "DISCUSSION" ? "discussion" : "main"}
                    onRetryFailedMessage={retryFailedClientMessage}
                  />
                  <div ref={internalBottomRef} />
                </div>

                <div className="shrink-0 border-t border-[#D7E4F0] bg-white p-3">
                  <TicketMessageComposer
                    draft={internalDraft}
                    onDraftChange={setInternalDraft}
                    onSubmit={() => void handleInternalSubmit()}
                    submitting={internalSubmitting}
                    placeholder={internalPlaceholder}
                    mentionableUsers={conversation.mentionable_users}
                    submitLabel={internalSubmitLabel}
                    modeLabel={internalModeLabel}
                    tone={internalComposerTone}
                    textareaId="ticket-internal-composer"
                    replyTarget={internalReplyTarget}
                    onCancelReply={internalReplyTarget ? () => setReplyTarget(null) : undefined}
                    onInviteToDiscussion={
                      internalComposerMode === "DISCUSSION"
                        ? () => {
                            setInviteDialogOpen(true)
                            setParticipantEmailError("")
                          }
                        : undefined
                    }
                    disabled={
                      workflowBusy ||
                      (internalComposerMode === "DISCUSSION" ? !canPostDiscussion : !canPostInternalNote)
                    }
                  />
                </div>
              </CardContent>
            </Card>
        ) : null}
      </div>

      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="border-[#9CB8D3] bg-[#F7FBFF] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#1D3F63]">Transfer Ticket</DialogTitle>
            <DialogDescription className="text-[#4A6887]">
              Transfer workflow ownership to another technician. The ticket will return to Awaiting Start for the new owner.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">New Workflow Owner</label>
              <select
                value={escalationTarget}
                onChange={(event) => setEscalationTarget(event.target.value)}
                className="h-10 w-full rounded-md border border-[#B7CBE0] bg-white px-3 text-sm text-slate-800"
                disabled={workflowBusy || technicians.length === 0}
              >
                <option value="">Select technician</option>
                {technicians.map((technician) => (
                  <option key={technician.id} value={String(technician.id)}>
                    {technician.name} ({technician.skillset})
                  </option>
                ))}
              </select>
              {technicians.length === 0 ? (
                <p className="text-xs text-[#8A6A21]">No alternate active technicians are available.</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Transfer Note</label>
              <textarea
                value={escalationComment}
                onChange={(event) => setEscalationComment(event.target.value)}
                placeholder="Optional: summarize context for the new owner."
                className="min-h-24 w-full rounded-md border border-[#B7CBE0] bg-white px-3 py-2 text-sm text-slate-800"
                disabled={workflowBusy}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-[#93AECA] bg-white text-[#20466D]"
              onClick={() => setTransferDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#0A63B8] text-white hover:bg-[#084C8C]"
              onClick={() => void handleTransferTicket()}
              disabled={workflowBusy || technicians.length === 0}
            >
              {workflowBusy ? "Transferring..." : "Transfer Ticket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={solvedConfirmOpen} onOpenChange={setSolvedConfirmOpen}>
        <DialogContent className="border-[#9CB8D3] bg-[#F7FBFF] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#1D3F63]">Confirm Solved</DialogTitle>
            <DialogDescription className="text-[#4A6887]">
              Confirm once you have finished solving this issue. The ticket will move to pending reporter review and
              the reporter will be asked to rate the fix.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-[#93AECA] bg-white text-[#20466D]"
              onClick={() => setSolvedConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#1C7C54] text-white hover:bg-[#155E40]"
              onClick={() => {
                setSolvedConfirmOpen(false)
                void handleTechnicianStatusUpdate("Solved")
              }}
              disabled={workflowBusy || autoStarting || detailStatus !== "In Progress"}
            >
              Solved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reviewModalOpen}
        onOpenChange={(open) => {
          setReviewModalOpen(open)
          if (!open) {
            setReviewComment("")
            setReviewRating("")
          }
        }}
      >
        <DialogContent className="border-[#9CB8D3] bg-[#F7FBFF] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#1D3F63]">
              {reviewModalMode === "confirm" ? "Confirm Resolution" : "Reopen Issue"}
            </DialogTitle>
            <DialogDescription className="text-[#4A6887]">
              Provide your rating and comment to {reviewModalMode === "confirm" ? "close" : "reopen"} this ticket.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-[#173A5D]">Rating (1-5)</label>
              <select
                value={reviewRating}
                onChange={(event) => setReviewRating(event.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-[#BFD1E4] bg-white px-3 text-sm text-[#173A5D]"
                disabled={workflowBusy}
              >
                <option value="">Select rating</option>
                <option value="5">5 - Excellent</option>
                <option value="4">4 - Good</option>
                <option value="3">3 - Fair</option>
                <option value="2">2 - Poor</option>
                <option value="1">1 - Very Poor</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-[#173A5D]">Comment</label>
              <textarea
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                placeholder={
                  reviewModalMode === "confirm"
                    ? "Share final feedback before closing."
                    : "Explain what still needs to be fixed."
                }
                className="mt-1 min-h-24 w-full rounded-xl border border-[#BFD1E4] bg-white px-3 py-2 text-sm text-[#173A5D]"
                disabled={workflowBusy}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-[#93AECA] bg-white text-[#20466D]"
              onClick={() => setReviewModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={reviewModalMode === "confirm" ? "bg-[#1C7C54] text-white hover:bg-[#155E40]" : "bg-[#B07A18] text-white hover:bg-[#8F6313]"}
              onClick={async () => {
                await handleProblemReview(reviewModalMode === "confirm")
                setReviewModalOpen(false)
              }}
              disabled={workflowBusy}
            >
              {reviewModalMode === "confirm" ? "Confirm Resolution" : "Reopen Issue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={inviteDialogOpen}
        onOpenChange={(open) => {
          setInviteDialogOpen(open)
          if (!open) {
            setParticipantEmail("")
            setParticipantEmailError("")
          }
        }}
      >
        <DialogContent className="border-[#9CB8D3] bg-[#F7FBFF] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#1D3F63]">Invite Teammate to Discussion</DialogTitle>
            <DialogDescription className="text-[#4A6887]">
              Enter a teammate email address to add them to this internal discussion and notify them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="email"
              value={participantEmail}
              onChange={(event) => {
                setParticipantEmail(event.target.value)
                if (participantEmailError) {
                  setParticipantEmailError("")
                }
              }}
              placeholder="teammate@company.com"
              className="border-[#93AECA] bg-white text-[#20466D]"
            />
            {participantEmailError ? <p className="text-sm text-rose-600">{participantEmailError}</p> : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-[#93AECA] bg-white text-[#20466D]"
              onClick={() => setInviteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#1C7C54] text-white hover:bg-[#155E40]"
              onClick={() => void handleInviteByEmail()}
              disabled={addingParticipant}
            >
              {addingParticipant ? "Inviting..." : "Invite to Discussion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
