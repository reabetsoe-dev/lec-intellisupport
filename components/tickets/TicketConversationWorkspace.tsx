"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowUpRight,
  BellDot,
  Clock3,
  LoaderCircle,
  MessageSquare,
  MessageSquarePlus,
  Shield,
  Star,
  TriangleAlert,
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
import { Input } from "@/components/ui/input"
import {
  addDiscussionParticipant,
  createTicketMessage,
  escalateTicket,
  escalateTicketByAdmin,
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

type DiscussionFabProps = {
  onClick: () => void
}

function DiscussionFab({ onClick }: DiscussionFabProps) {
  return (
    <div className="group fixed bottom-6 right-6 z-50">
      <button
        type="button"
        aria-label="Open conversations"
        title="Open conversations"
        onClick={onClick}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-500 text-white shadow-lg transition hover:scale-105 hover:bg-teal-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
      >
        <MessageSquarePlus className="h-6 w-6" />
      </button>
      <div className="pointer-events-none absolute bottom-full right-0 mb-3 whitespace-nowrap rounded-lg bg-[#173A5D] px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100">
        Open conversations
      </div>
    </div>
  )
}

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

function priorityBadgeClass(priority: string): string {
  const normalized = priority.trim().toLowerCase()
  if (normalized === "critical") {
    return "border-[#EDB0B0] bg-[#FFEAEA] text-[#9D3030]"
  }
  if (normalized === "high") {
    return "border-[#F3CF98] bg-[#FFF4DE] text-[#996100]"
  }
  if (normalized === "medium") {
    return "border-[#9CD8C2] bg-[#E6F9F2] text-[#176B4A]"
  }
  return "border-[#A9CAE9] bg-[#EDF5FD] text-[#285D8D]"
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

function canForceShowDiscussionFab(role?: UserRole | null): boolean {
  return role === "technician" || role === "admin_fault" || role === "admin_consumables"
}

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

  const [workflowBusy, setWorkflowBusy] = useState(false)
  const [priorityValue, setPriorityValue] = useState("Medium")
  const [escalationComment, setEscalationComment] = useState("")
  const [escalationTarget, setEscalationTarget] = useState("")
  const [reviewRating, setReviewRating] = useState("")
  const [reviewComment, setReviewComment] = useState("")
  const mainScrollRef = useRef<HTMLDivElement | null>(null)
  const internalScrollRef = useRef<HTMLDivElement | null>(null)
  const mainBottomRef = useRef<HTMLDivElement | null>(null)
  const internalBottomRef = useRef<HTMLDivElement | null>(null)

  const [clientMessages, setClientMessages] = useState<TicketChatMessage[]>([])
  const paneKeyRef = useRef<"main" | "discussion" | "notes">("main")

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
  const canShowDiscussionFab = canForceShowDiscussionFab(resolvedRole)
  const detailStatus = ticket ? normalizeTicketStatus(ticket.status) : "Pending"

  const loadWorkspace = useCallback(async (viewer: AuthUser) => {
    const [ticketPayload, conversationPayload, technicianPayload] = await Promise.all([
      getTicketById(ticketId),
      getTicketMessages(ticketId),
      viewer.role === "technician" ? getTechnicians() : Promise.resolve([]),
    ])
    setTicket(ticketPayload)
    setConversation(conversationPayload)
    setPriorityValue(ticketPayload.priority)
    setTechnicians(
      technicianPayload.filter((item) => item.user_id !== viewer.id && item.is_available)
    )
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
    () => [...replyThread, ...clientMainMessages],
    [replyThread, clientMainMessages]
  )

  const discussionRenderMessages = useMemo(
    () => [...discussionThread, ...clientDiscussionMessages],
    [discussionThread, clientDiscussionMessages]
  )

  const internalNoteRenderMessages = useMemo(
    () => [...internalNoteThread, ...clientInternalNoteMessages],
    [internalNoteThread, clientInternalNoteMessages]
  )

  const lifecycleComments = useMemo(() => {
    return [...(ticket?.comments ?? [])].sort(
      (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    )
  }, [ticket?.comments])

  const refreshConversationOnly = async () => {
    const payload = await getTicketMessages(ticketId)
    setConversation(payload)
  }

  const generateClientId = () => {
    // Browser runtime (Next.js) should support crypto.randomUUID, but keep a safe fallback.
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID()
    }
    return `client_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }

  const refreshAll = async () => {
    if (!currentUser) {
      return
    }
    await loadWorkspace(currentUser)
  }

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

  const activateDiscussionFromFab = () => {
    focusConversationSection()

    window.setTimeout(() => {
      const activeComposerId =
        canViewInternal && conversationView === "internal" ? "ticket-internal-composer" : "ticket-reply-composer"
      const activeComposer = document.getElementById(activeComposerId)
      if (activeComposer instanceof HTMLElement) {
        activeComposer.focus()
      }
    }, 300)
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
    try {
      setWorkflowBusy(true)
      await updateTicketStatus(ticket.id, nextStatus, undefined, currentUser.id)
      await refreshAll()
      setFlash({
        type: "success",
        message:
          nextStatus === "In Progress"
            ? "Ticket accepted and reporter notified."
            : "Ticket marked solved and moved to reporter review.",
      })
    } catch (error) {
      setFlash({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to update ticket status.",
      })
    } finally {
      setWorkflowBusy(false)
    }
  }

  const handleAdminStatusUpdate = async (nextStatus: "In Progress" | "Pending Review") => {
    if (!ticket || !currentUser) {
      return
    }
    try {
      setWorkflowBusy(true)
      await updateTicketStatus(ticket.id, nextStatus, currentUser.id)
      await refreshAll()
      setFlash({
        type: "success",
        message:
          nextStatus === "In Progress"
            ? "Ticket moved to In Progress."
            : "Ticket moved to Pending Review.",
      })
    } catch (error) {
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

  const handleEscalate = async () => {
    if (!ticket || !currentUser || !escalationComment.trim()) {
      setFlash({ type: "error", message: "Please provide escalation notes before submitting." })
      return
    }

    try {
      setWorkflowBusy(true)
      if (currentUser.role === "technician") {
        if (!escalationTarget) {
          setFlash({ type: "error", message: "Choose the technician to escalate to." })
          return
        }
        await escalateTicket(ticket.id, currentUser.id, Number(escalationTarget), escalationComment.trim())
      } else if (currentUser.role === "admin_fault") {
        await escalateTicketByAdmin(ticket.id, currentUser.id, escalationComment.trim())
      }
      setEscalationComment("")
      setEscalationTarget("")
      await refreshAll()
      setFlash({ type: "success", message: "Ticket escalated successfully." })
    } catch (error) {
      setFlash({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to escalate ticket.",
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

  useEffect(() => {
    if (!conversation) {
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

    // Only auto-scroll when user is near the bottom to avoid interrupting scrolling up.
    const distanceFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight
    const nearBottom = distanceFromBottom <= 100
    if (!paneChanged && !nearBottom) {
      return
    }

    sentinelEl.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [
    showMainConversation,
    showInternalConversation,
    internalComposerMode,
    // Use lengths to avoid re-triggering auto-scroll on status-only updates.
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
        {canShowDiscussionFab ? <DiscussionFab onClick={activateDiscussionFromFab} /> : null}
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <div
          id={conversationSectionId}
          tabIndex={-1}
          role="region"
          aria-label="Ticket conversations"
          className="rounded-2xl border border-[#EDB0B0] bg-white p-5 outline-none"
        >
          <p className="text-sm text-rose-600">{loadError}</p>
        </div>
        {canShowDiscussionFab ? <DiscussionFab onClick={activateDiscussionFromFab} /> : null}
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
        {canShowDiscussionFab ? <DiscussionFab onClick={activateDiscussionFromFab} /> : null}
      </div>
    )
  }

  const reporterName = ticket.employee_name ?? `Employee #${ticket.employee_id}`
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
  const replyActionLabel = canViewInternal ? "Reply to Employee" : "Reply to Support"

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

      <div className="space-y-6">
        <Card className="rounded-2xl border-[#C8D7E8] bg-[linear-gradient(180deg,#F8FBFF_0%,#F0F6FB_100%)] py-0 shadow-sm">
        <CardHeader className="border-b border-[#D7E4F0] px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5A7CA0]">
                {formatTrackingId(ticket.id)}
              </p>
              <CardTitle className="mt-1 text-2xl font-semibold text-[#173A5D]">{ticket.title}</CardTitle>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#4A6F95]">
                {ticket.description || "No detailed description provided."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className={cn("rounded-full border px-3 py-1", statusBadgeClass(detailStatus))}>
                Status: {detailStatus}
              </Badge>
              <Badge className={cn("rounded-full border px-3 py-1", priorityBadgeClass(ticket.priority))}>
                Priority: {ticket.priority}
              </Badge>
              <Badge variant="outline" className="border-[#BFD1E4] bg-white text-[#295985]">
                Category: {ticket.category}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 px-6 py-5 text-sm text-[#365C81] md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[#D7E4F0] bg-white p-3">
            <p className="text-xs font-medium text-[#6A87A4]">Reporter</p>
            <p className="mt-1 font-semibold text-[#21476D]">{reporterName}</p>
          </div>
          <div className="rounded-xl border border-[#D7E4F0] bg-white p-3">
            <p className="text-xs font-medium text-[#6A87A4]">Assigned Technician</p>
            <p className="mt-1 font-semibold text-[#21476D]">{ticket.technician_name || "Unassigned"}</p>
          </div>
          <div className="rounded-xl border border-[#D7E4F0] bg-white p-3">
            <p className="text-xs font-medium text-[#6A87A4]">Branch / Location</p>
            <p className="mt-1 font-semibold text-[#21476D]">{ticket.location || "N/A"}</p>
          </div>
          <div className="rounded-xl border border-[#D7E4F0] bg-white p-3">
            <p className="text-xs font-medium text-[#6A87A4]">Last Updated</p>
            <p className="mt-1 font-semibold text-[#21476D]">{formatDateTime(ticket.updated_at)}</p>
          </div>
        </CardContent>
        <div
          id={conversationSectionId}
          tabIndex={-1}
          role="region"
          aria-label="Ticket conversations"
          className="border-t border-[#D7E4F0] px-6 py-4 outline-none"
        >
              <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConversationView("main")
              }}
              className={cn("border shadow-none", actionButtonClass(showMainConversation, "reply"))}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
                  Main
            </Button>
            {canViewInternal ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setConversationView("internal")
                  setInternalComposerMode("DISCUSSION")
                }}
                className={cn("border shadow-none", actionButtonClass(showInternalConversation, "discussion"))}
              >
                <Users className="mr-2 h-4 w-4" />
                    Internal
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="relative h-[calc(100vh-320px)] min-h-[720px]">
        <div
          className={cn(
            "absolute inset-0 flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto pr-1 transition-opacity duration-200",
            showMainConversation ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}
        >
          <Card className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-3xl border-[#D7E4F0] bg-[#efeae2] py-0 shadow-sm">
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

              <div className="sticky bottom-0 border-t border-[#D7E4F0] bg-white/95 p-3 backdrop-blur shadow-[0_-2px_10px_rgba(0,0,0,0.05)] transition-all">
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

          <Card className="rounded-2xl border-[#C8D7E8] bg-white py-0 shadow-sm">
            <CardHeader className="border-b border-[#E1EAF3] px-6 py-5">
              <CardTitle className="text-lg font-semibold text-[#173A5D]">Lifecycle Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-6 py-5">
              {lifecycleComments.length === 0 ? (
                <p className="text-sm text-[#5A7CA0]">No lifecycle activity recorded yet.</p>
              ) : (
                lifecycleComments.map((comment) => (
                  <div key={comment.id} className="rounded-2xl border border-[#D7E4F0] bg-[#F8FBFF] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#173A5D]">{comment.author_name}</p>
                      <p className="text-xs text-[#5A7CA0]">{formatDateTime(comment.created_at)}</p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#24486E]">{comment.comment}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {canViewInternal ? (
          <div
            className={cn(
              "absolute inset-0 flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto border-l border-[#D7E4F0] pl-4 transition-opacity duration-200",
              showInternalConversation ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            )}
          >
            <Card className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-3xl border-[#D7E4F0] bg-[#efeae2] py-0 shadow-sm">
              <CardHeader className="border-b border-[#D7E4F0] bg-white/90 px-5 py-4 backdrop-blur">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#e8e8e8] text-[#4b5563]">
                    <Shield className="h-5 w-5" />
                  </span>
                  <div>
                    <CardTitle className="text-base font-semibold text-[#173A5D]">Internal conversation</CardTitle>
                    <p className="text-sm text-[#5A7CA0]">
                      Staff-only discussion, internal notes, participants, and mentions.
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

                <div className="sticky bottom-0 border-t border-[#D7E4F0] bg-white/95 p-3 backdrop-blur shadow-[0_-2px_10px_rgba(0,0,0,0.05)] transition-all">
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
            
            <Card className="rounded-2xl border-[#C8D7E8] bg-white py-0 shadow-sm">
              <CardHeader className="border-b border-[#E1EAF3] px-6 py-5">
                <CardTitle className="text-lg font-semibold text-[#173A5D]">Role Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-6 py-5">
                {currentUser.role === "technician" ? (
                  <>
                    <div className="rounded-2xl border border-[#D7E4F0] bg-[#F8FBFF] p-4">
                      <p className="text-sm font-semibold text-[#173A5D]">Technician Workflow</p>
                      <p className="mt-1 text-sm text-[#5A7CA0]">
                        Accept pending tickets, complete the work, and escalate when a different technician is needed.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={() => void handleTechnicianStatusUpdate("In Progress")}
                          disabled={workflowBusy || detailStatus !== "Pending"}
                          className="bg-[#0A63B8] text-white hover:bg-[#084C8C]"
                        >
                          {workflowBusy && detailStatus === "Pending" ? (
                            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Accept Ticket
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void handleTechnicianStatusUpdate("Solved")}
                          disabled={workflowBusy || detailStatus !== "In Progress"}
                          className="bg-[#1C7C54] text-white hover:bg-[#155E40]"
                        >
                          {workflowBusy && detailStatus === "In Progress" ? (
                            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Mark Solved
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#E5D2AB] bg-[#FFF9EC] p-4">
                      <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#7A5700]">
                        <TriangleAlert className="h-4 w-4" />
                        Escalate to Another Technician
                      </p>
                      <p className="mt-1 text-sm text-[#8A6A21]">
                        Use escalation when the work needs a different specialist or additional field support.
                      </p>
                      <select
                        value={escalationTarget}
                        onChange={(event) => setEscalationTarget(event.target.value)}
                        className="mt-3 h-10 w-full rounded-xl border border-[#D5C08A] bg-white px-3 text-sm text-[#173A5D]"
                        disabled={workflowBusy || technicians.length === 0}
                      >
                        <option value="">Choose a technician</option>
                        {technicians.map((technician) => (
                          <option key={technician.id} value={String(technician.id)}>
                            {technician.name}
                          </option>
                        ))}
                      </select>
                      {technicians.length === 0 ? (
                        <p className="mt-2 text-xs text-[#8A6A21]">No alternate technicians are currently available.</p>
                      ) : null}
                      <textarea
                        value={escalationComment}
                        onChange={(event) => setEscalationComment(event.target.value)}
                        placeholder="Summarize the work completed and why escalation is needed."
                        className="mt-3 min-h-24 w-full rounded-xl border border-[#D5C08A] bg-white px-3 py-2 text-sm text-[#173A5D]"
                      />
                      <Button
                        type="button"
                        onClick={() => void handleEscalate()}
                        disabled={workflowBusy || detailStatus === "Pending Review" || detailStatus === "Solved"}
                        className="mt-3 bg-[#9A6400] text-white hover:bg-[#7F5200]"
                      >
                        <ArrowUpRight className="mr-2 h-4 w-4" />
                        Escalate Ticket
                      </Button>
                    </div>
                  </>
                ) : null}

                {currentUser.role === "admin_fault" ? (
                  <>
                    <div className="rounded-2xl border border-[#D7E4F0] bg-[#F8FBFF] p-4">
                      <p className="text-sm font-semibold text-[#173A5D]">Priority Control</p>
                      <p className="mt-1 text-sm text-[#5A7CA0]">
                        Adjust urgency without interrupting the existing lifecycle.
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <select
                          value={priorityValue}
                          onChange={(event) => setPriorityValue(event.target.value)}
                          className="h-10 flex-1 rounded-xl border border-[#BFD1E4] bg-white px-3 text-sm text-[#173A5D]"
                          disabled={workflowBusy}
                        >
                          {["Low", "Medium", "High", "Critical"].map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          onClick={() => void handlePrioritySave()}
                          disabled={workflowBusy || priorityValue === ticket.priority}
                          className="bg-[#0A63B8] text-white hover:bg-[#084C8C]"
                        >
                          Save Priority
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#D7E4F0] bg-[#F8FBFF] p-4">
                      <p className="text-sm font-semibold text-[#173A5D]">Status Control</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={() => void handleAdminStatusUpdate("In Progress")}
                          disabled={workflowBusy || detailStatus !== "Pending"}
                          className="bg-[#0A63B8] text-white hover:bg-[#084C8C]"
                        >
                          Accept Ticket
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void handleAdminStatusUpdate("Pending Review")}
                          disabled={workflowBusy || detailStatus !== "In Progress"}
                          className="bg-[#B07A18] text-white hover:bg-[#8F6313]"
                        >
                          Send For Review
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#E5D2AB] bg-[#FFF9EC] p-4">
                      <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#7A5700]">
                        <TriangleAlert className="h-4 w-4" />
                        Auto Escalation
                      </p>
                      <p className="mt-1 text-sm text-[#8A6A21]">
                        The system will re-route this ticket to the best available technician based on skill and workload.
                      </p>
                      <textarea
                        value={escalationComment}
                        onChange={(event) => setEscalationComment(event.target.value)}
                        placeholder="Explain why the ticket should be escalated."
                        className="mt-3 min-h-24 w-full rounded-xl border border-[#D5C08A] bg-white px-3 py-2 text-sm text-[#173A5D]"
                      />
                      <Button
                        type="button"
                        onClick={() => void handleEscalate()}
                        disabled={workflowBusy || detailStatus === "Pending" || detailStatus === "Pending Review" || detailStatus === "Solved"}
                        className="mt-3 bg-[#9A6400] text-white hover:bg-[#7F5200]"
                      >
                        <ArrowUpRight className="mr-2 h-4 w-4" />
                        Escalate Ticket
                      </Button>
                    </div>
                  </>
                ) : null}

                {currentUser.role === "manager" || currentUser.role === "admin_consumables" ? (
                  <div className="rounded-2xl border border-[#D7E4F0] bg-[#F8FBFF] p-4">
                    <p className="text-sm font-semibold text-[#173A5D]">Oversight Access</p>
                    <p className="mt-2 text-sm leading-6 text-[#5A7CA0]">
                      You can monitor the full communication history, participate in internal discussion, and use
                      mentions to bring in the right staff members without changing the ticket lifecycle directly.
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="hidden">
            <Card className="rounded-2xl border-[#C8D7E8] bg-white py-0 shadow-sm">
              <CardHeader className="border-b border-[#E1EAF3] px-6 py-5">
                <CardTitle className="text-lg font-semibold text-[#173A5D]">Ticket Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-6 py-5">
                <div className="rounded-2xl border border-[#D7E4F0] bg-[#F8FBFF] p-4">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#173A5D]">
                    <BellDot className="h-4 w-4 text-[#0A63B8]" />
                    Current Status
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#5A7CA0]">
                    {detailStatus === "Pending"
                      ? "Your ticket is waiting for the support team to begin work."
                      : detailStatus === "In Progress"
                        ? "The support team is actively working on your issue. Use the conversation panel to share updates."
                        : detailStatus === "Pending Review"
                          ? "The technician marked the work as complete. Please review the result before the ticket is closed."
                          : "This ticket has been resolved. The conversation remains available for your records."}
                  </p>
                </div>

                {detailStatus === "Pending Review" ? (
                  <div className="rounded-2xl border border-[#E5D2AB] bg-[#FFF9EC] p-4">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#7A5700]">
                      <Star className="h-4 w-4" />
                      Final Problem Review
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#8A6A21]">
                      Confirm whether the issue is fully resolved. A rating is required for final review.
                    </p>
                    <div className="mt-3">
                      <label className="text-sm font-medium text-[#7A5700]">Rating (1-5)</label>
                      <select
                        value={reviewRating}
                        onChange={(event) => setReviewRating(event.target.value)}
                        className="mt-1 h-10 w-full rounded-xl border border-[#D5C08A] bg-white px-3 text-sm text-[#173A5D]"
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
                    <textarea
                      value={reviewComment}
                      onChange={(event) => setReviewComment(event.target.value)}
                      placeholder="Add optional feedback. This becomes required if you need more work."
                      className="mt-3 min-h-24 w-full rounded-xl border border-[#D5C08A] bg-white px-3 py-2 text-sm text-[#173A5D]"
                      disabled={workflowBusy}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => void handleProblemReview(true)}
                        disabled={workflowBusy}
                        className="bg-[#1C7C54] text-white hover:bg-[#155E40]"
                      >
                        Approve and Close
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void handleProblemReview(false)}
                        disabled={workflowBusy}
                        variant="outline"
                        className="border-[#C98F2A] text-[#8A5A00] hover:bg-[#FFF5DF]"
                      >
                        Needs More Work
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[#D7E4F0] bg-[#F8FBFF] p-4">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#173A5D]">
                      <Clock3 className="h-4 w-4 text-[#0A63B8]" />
                      What Happens Next
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#5A7CA0]">
                      The support team will continue updating the main conversation. You can reply here any time to add
                      more context, answer questions, or confirm whether the solution worked.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      </div>

      {canShowDiscussionFab ? (
        <DiscussionFab onClick={activateDiscussionFromFab} />
      ) : null}

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
