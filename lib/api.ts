export type UserRole = "employee" | "technician" | "admin_fault" | "admin_consumables" | "manager"

export type LoginResponse = {
  id: number
  name: string
  role: UserRole
  must_change_password?: boolean
  token: string
}

export type CreateTicketPayload = {
  title: string
  description: string
  category?: string
  location: string
  priority?: string
  department?: string
  asset?: string
  impact?: string
  ai_confidence?: number
  employee_id: number
  reporter_reviewed_problem: boolean
  caller_name?: string
  logged_by_admin_id?: number
}

export type Ticket = {
  id: number
  title: string
  description: string
  category: string
  location?: string
  priority: string
  status: string
  employee_id: number
  caller_name?: string | null
  logged_by_admin_id?: number | null
  logged_by_admin_name?: string | null
  technician_id?: number | null
  technician_name?: string | null
  employee_name?: string | null
  routed_to_role?: UserRole
  routing_note?: string
  reporter_reviewed_problem?: boolean
  created_at?: string
  updated_at?: string
  is_currently_assigned_to_me?: boolean
  escalated_by_me?: boolean
  latest_escalation_comment?: string | null
  latest_escalation_by?: string | null
  latest_escalation_at?: string | null
  latest_escalation_target?: string | null
  assigned_at?: string | null
  accepted_at?: string | null
  last_activity_at?: string | null
  escalation_level?: number
  reassign_count?: number
}

export type TicketComment = {
  id: number
  author_id: number
  author_name: string
  comment: string
  created_at: string
}

export type TicketDetail = Ticket & {
  comments: TicketComment[]
  can_view_internal_messages?: boolean
  can_manage_discussion_participants?: boolean
}

export type TicketMessageType = "REPLY" | "INTERNAL_NOTE" | "DISCUSSION"

export type MentionableUser = {
  id: number
  name: string
  email: string
  role: UserRole
  mention_handle: string
}

export type DiscussionParticipant = {
  id: number
  ticket_id: number
  user: MentionableUser
  added_by: MentionableUser
  created_at: string
}

export type TicketMessage = {
  id: number
  ticket_id: number
  sender: MentionableUser
  message_type: TicketMessageType
  content: string
  parent_message_id: number | null
  is_internal: boolean
  created_at: string
  mention_tokens: string[]
  children: TicketMessage[]
}

export type TicketMessagesResponse = {
  main_thread: TicketMessage[]
  discussion_thread: TicketMessage[]
  participants: DiscussionParticipant[]
  mentionable_users: MentionableUser[]
  permissions: {
    can_view_internal_messages: boolean
    can_manage_discussion_participants: boolean
    can_post_discussion: boolean
    can_post_internal_note: boolean
    can_post_reply: boolean
  }
}

export type TicketMaterialRequest = {
  id: number
  ticket_id: number
  requested_by_id: number
  requested_by_name: string
  item_name: string
  quantity: number
  notes: string
  status: "pending" | "approved" | "rejected"
  created_at: string
  updated_at: string
}

export type Technician = {
  id: number
  user_id: number
  name: string
  email: string
  branch: string
  department: string
  skillset: string
  is_active: boolean
  is_available: boolean
}

export type Employee = {
  id: number
  name: string
  email: string
  branch: string
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CountDatum = {
  name: string
  count: number
}

export type TechnicianBreakdownDatum = {
  name: string
  assigned: number
  solved: number
  pending: number
  escalated: number
}

export type CreatedResolvedDatum = {
  name: string
  created: number
  resolved: number
}

export type PerformanceRange = "today" | "7d" | "30d" | "90d" | "all" | "custom"

export type PerformanceMetricsQuery = {
  range?: PerformanceRange
  start_date?: string
  end_date?: string
}

export type PerformanceMetrics = {
  kpis: {
    total_tickets: number
    open_tickets: number
    resolved_tickets: number
    critical_tickets: number
    unassigned_tickets: number
    resolved_rate: number
    avg_resolution_hours?: number
    sla_breach_rate?: number
    stale_open_tickets?: number
  }
  by_status: CountDatum[]
  by_priority: CountDatum[]
  by_category: CountDatum[]
  by_month: CountDatum[]
  by_season: CountDatum[]
  by_technician: CountDatum[]
  technician_breakdown?: TechnicianBreakdownDatum[]
  created_vs_resolved?: CreatedResolvedDatum[]
  backlog_aging?: CountDatum[]
  sla_summary?: {
    within_target: number
    at_risk: number
    breached: number
  }
  sla_config?: {
    acceptance_sla_minutes: number
    reassign_threshold_minutes: number
    escalation_threshold_minutes: number
  }
  sla_operational?: {
    awaiting_acceptance: number
    acceptance_overdue: number
    inactivity_breached: number
    auto_reassigned: number
    escalated_tickets: number
    avg_acceptance_minutes: number
  }
  sla_by_technician?: Array<{
    name: string
    assigned: number
    awaiting_acceptance: number
    at_risk: number
    breached: number
    auto_reassigned: number
    escalated: number
    avg_acceptance_minutes: number
  }>
  technician_performance_scores?: Array<{
    name: string
    skillset: string
    total_assigned: number
    completed: number
    success_rate: number
    success_rate_percent: number
    resolution_score: number
    resolution_score_percent: number
    avg_resolution_hours: number
    performance_score: number
    performance_score_percent: number
    pending_acceptance_count: number
    overdue_acceptance_count: number
    recent_assignment_count: number
    reassignment_readiness_score: number
    reassignment_readiness_score_percent: number
  }>
  filters?: {
    range: string
    start_date?: string | null
    end_date?: string | null
    bucket_mode?: "day" | "month" | string
  }
  generated_at: string
}

export type BusinessDayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"

export type BusinessHoursWindow = {
  enabled: boolean
  start: string
  end: string
}

export type BusinessHoursSchedule = Record<BusinessDayKey, BusinessHoursWindow>

export type BusinessHoliday = {
  id: number
  name: string
  date: string
}

export type BusinessLeaveTypeOption = {
  value: string
  label: string
}

export type BusinessLeave = {
  id: number
  technician_id: number
  technician_name: string
  leave_type: string
  leave_type_label: string
  start_date: string
  end_date: string
}

export type BusinessHoursGroupOption = {
  value: string
  label: string
}

export type BusinessHoursConfig = {
  id: number
  name: string
  description: string
  timezone: string
  groups: string[]
  group_options: BusinessHoursGroupOption[]
  leave_type_options: BusinessLeaveTypeOption[]
  schedule: BusinessHoursSchedule
  holidays: BusinessHoliday[]
  leaves: BusinessLeave[]
  is_open_now: boolean
  updated_at: string
}

export type AppNotification = {
  id: number
  message: string
  type: "MENTION" | "REPLY" | "DISCUSSION" | "SYSTEM"
  is_read: boolean
  ticket_id?: number | null
  ticket_message_id?: number | null
  created_at: string
  read_at?: string | null
}

export type NotificationsResponse = {
  unread_count: number
  notifications: AppNotification[]
}

export type Consumable = {
  id: number
  type?: string | null
  asset_tag?: string | null
  item_name: string
  manufacturer?: string | null
  brand?: string | null
  brand_model?: string | null
  model_number?: string | null
  serial_number?: string | null
  category?: string | null
  subcategory?: string | null
  processor?: string | null
  ram?: string | null
  storage_type?: string | null
  storage_capacity?: string | null
  graphics_card?: string | null
  charger_included?: boolean | null
  monitor_included?: boolean | null
  keyboard_included?: boolean | null
  mouse_included?: boolean | null
  printer_type?: string | null
  print_speed?: string | null
  connectivity?: string | null
  duplex_printing?: boolean | null
  paper_capacity?: string | null
  color_printing?: boolean | null
  device_type?: string | null
  operating_system?: string | null
  battery_capacity?: string | null
  imei_number?: string | null
  quantity: number
  available_quantity?: number | null
  total_quantity?: number | null
  cost?: number | null
  purchase_cost?: number | null
  supplier?: string | null
  warranty_expiry?: string | null
  department?: string | null
  condition?: string | null
  status?: string | null
  purchase_date?: string | null
  assigned_employee?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type ConsumableAssignmentType = "new" | "loan" | "exchange"

export type ConsumableRequest = {
  id: string
  db_id: number
  itemName: string
  quantity: number
  assignmentType: ConsumableAssignmentType
  department: string
  notes: string
  requestedBy: string
  requestedAt: string
  status: "pending" | "approved" | "rejected"
  approvedBy?: string | null
  approvedAt?: string | null
  rejectedBy?: string | null
  rejectedAt?: string | null
  rejectionReason?: string | null
}

export type ConsumableReturn = {
  id: number
  consumableRequestId: number
  consumableId: number
  itemName: string
  assignmentType: ConsumableAssignmentType
  employeeId: number
  employeeName: string
  quantity: number
  reason: string
  status: "pending" | "received" | "rejected"
  receivedBy?: string | null
  receivedAt?: string | null
  rejectedBy?: string | null
  rejectedAt?: string | null
  rejectionReason?: string | null
  createdAt: string
  updatedAt: string
}

export type ChatbotResponse = {
  reply: string
  confidence?: number
  needs_clarification?: boolean
  category?: string | null
  recommended_technician?: string
  intent?: string
}

export type TicketIntakeDraft = {
  title: string
  description: string
  category: string
  priority: string
  asset?: string
  impact?: string
  branch?: string
  department?: string
}

export type TicketIntakeMode = "direct" | "follow_up" | "manual"

export type TicketIntakeDraftResponse = {
  draft: TicketIntakeDraft
  confidence: number
  follow_up_questions: string[]
  intake_mode: TicketIntakeMode
}

export type VoiceTicketDraftResponse = TicketIntakeDraftResponse & {
  transcript: string
  transcription_source?: string
}

type AddConsumablePayload = {
  asset_tag?: string
  item_name: string
  manufacturer?: string
  brand?: string
  model_number?: string
  serial_number?: string
  category?: string
  subcategory?: string
  processor?: string
  ram?: string
  storage_type?: string
  storage_capacity?: string
  graphics_card?: string
  charger_included?: boolean
  monitor_included?: boolean
  keyboard_included?: boolean
  mouse_included?: boolean
  printer_type?: string
  print_speed?: string
  connectivity?: string
  duplex_printing?: boolean
  paper_capacity?: string
  color_printing?: boolean
  device_type?: string
  operating_system?: string
  battery_capacity?: string
  imei_number?: string
  quantity: number
  purchase_cost?: number
  supplier?: string
  warranty_expiry?: string
  department?: string
  condition?: string
  status?: string
  purchase_date?: string
  assigned_employee?: string
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  token?: string
  authMode?: "session" | "none"
  headers?: Record<string, string>
  timeoutMs?: number
  service?: "backend" | "ai"
}

export type ApiErrorCode =
  | "CONFIGURATION_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "INVALID_RESPONSE"
  | "UNKNOWN"

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status?: number
  readonly service: "backend" | "ai" | "unknown"
  readonly details?: unknown
  readonly retryable: boolean

  constructor(
    message: string,
    options: {
      code: ApiErrorCode
      status?: number
      service?: "backend" | "ai" | "unknown"
      details?: unknown
      retryable?: boolean
    }
  ) {
    super(message)
    this.name = "ApiError"
    this.code = options.code
    this.status = options.status
    this.service = options.service ?? "unknown"
    this.details = options.details
    this.retryable = Boolean(options.retryable)
  }
}

const AUTH_SESSION_STORAGE_KEY = "lec_intellisupport_user"
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const MAX_ERROR_MESSAGE_LENGTH = 240
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function clampErrorMessage(message: string): string {
  const trimmed = message.trim()
  if (trimmed.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return trimmed
  }
  return `${trimmed.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3).trimEnd()}...`
}

function normalizeLoopbackHostname(hostname: string): string {
  if (hostname === "localhost") {
    return "127.0.0.1"
  }
  return hostname
}

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase())
}

function normalizeConfiguredBaseUrl(envName: string, envUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(envUrl)
  } catch {
    throw new ApiError(`Invalid ${envName}. Expected an absolute http(s) URL.`, {
      code: "CONFIGURATION_ERROR",
      service: "unknown",
    })
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ApiError(`${envName} must use http or https.`, {
      code: "CONFIGURATION_ERROR",
      service: "unknown",
    })
  }

  if (parsed.username || parsed.password) {
    throw new ApiError(`${envName} must not include embedded credentials.`, {
      code: "CONFIGURATION_ERROR",
      service: "unknown",
    })
  }

  if (parsed.search || parsed.hash) {
    throw new ApiError(`${envName} must not include query strings or hashes.`, {
      code: "CONFIGURATION_ERROR",
      service: "unknown",
    })
  }

  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    parsed.protocol !== "https:" &&
    !isLoopbackHostname(parsed.hostname)
  ) {
    throw new ApiError(`${envName} must use https when the app is served over https.`, {
      code: "CONFIGURATION_ERROR",
      service: "unknown",
    })
  }

  const normalizedPathname = parsed.pathname.replace(/\/$/, "")
  return `${parsed.origin}${normalizedPathname}`
}

function resolveServiceBaseUrl(envUrl: string | undefined, fallbackPort: number): string {
  if (envUrl && envUrl.trim()) {
    const envName = fallbackPort === 8000 ? "NEXT_PUBLIC_BACKEND_URL" : "NEXT_PUBLIC_AI_SERVICE_URL"
    return normalizeConfiguredBaseUrl(envName, envUrl.trim())
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:"
    const host = normalizeLoopbackHostname(window.location.hostname)
    return `${protocol}//${host}:${fallbackPort}`
  }

  return `http://127.0.0.1:${fallbackPort}`
}

function toIpv4Localhost(baseUrl: string): string {
  return baseUrl.replace("://localhost", "://127.0.0.1")
}

const BACKEND_BASE_URL = resolveServiceBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL, 8000)
const AI_BASE_URL = resolveServiceBaseUrl(process.env.NEXT_PUBLIC_AI_SERVICE_URL, 8001)

function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as { token?: unknown }
    if (!isRecord(parsed) || typeof parsed.token !== "string") {
      return null
    }
    const token = parsed.token.trim()
    return token.length > 0 ? token : null
  } catch {
    return null
  }
}

function unwrapApiData<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

function getDefaultErrorMessage(status?: number): string {
  if (status === 400) {
    return "The request was invalid. Please review your input and try again."
  }
  if (status === 401) {
    return "Your session has expired. Please sign in again."
  }
  if (status === 403) {
    return "You do not have permission to perform this action."
  }
  if (status === 404) {
    return "The requested resource could not be found."
  }
  if (status === 408) {
    return "The request timed out. Please try again."
  }
  if (status === 429) {
    return "Too many requests were sent. Please wait a moment and try again."
  }
  if (typeof status === "number" && status >= 500) {
    return "The server encountered an error. Please try again shortly."
  }
  return "The request could not be completed."
}

function mapStatusToErrorCode(status?: number): ApiErrorCode {
  if (status === 401) {
    return "UNAUTHORIZED"
  }
  if (status === 403) {
    return "FORBIDDEN"
  }
  if (status === 404) {
    return "NOT_FOUND"
  }
  if (status === 408 || status === 504) {
    return "TIMEOUT"
  }
  if (status === 429) {
    return "RATE_LIMITED"
  }
  if (typeof status === "number" && status >= 500) {
    return "SERVER_ERROR"
  }
  return "UNKNOWN"
}

function extractMessageFromPayload(payload: unknown): string | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim()
    return trimmed.length > 0 ? clampErrorMessage(trimmed) : null
  }

  if (Array.isArray(payload)) {
    const messages = payload
      .map((item) => extractMessageFromPayload(item))
      .filter((item): item is string => Boolean(item))
    return messages.length > 0 ? clampErrorMessage(messages.join(" ")) : null
  }

  if (!isRecord(payload)) {
    return null
  }

  const preferredKeys = ["message", "detail", "error", "errors", "non_field_errors"]
  for (const key of preferredKeys) {
    if (key in payload) {
      const message = extractMessageFromPayload(payload[key])
      if (message) {
        return message
      }
    }
  }

  const fieldMessages = Object.entries(payload)
    .map(([field, value]) => {
      const message = extractMessageFromPayload(value)
      if (!message) {
        return null
      }
      return field === "detail" || field === "message" ? message : `${field}: ${message}`
    })
    .filter((value): value is string => Boolean(value))

  return fieldMessages.length > 0 ? clampErrorMessage(fieldMessages.join(" ")) : null
}

function parseResponseBody(rawBody: string, contentType: string): unknown {
  if (!rawBody) {
    return undefined
  }

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawBody) as unknown
    } catch {
      throw new ApiError("The server returned malformed JSON.", {
        code: "INVALID_RESPONSE",
        retryable: false,
      })
    }
  }

  return rawBody
}

function buildRequestUrl(baseUrl: string, path: string): string {
  if (!path.startsWith("/")) {
    throw new ApiError(`API paths must start with '/'. Received '${path}'.`, {
      code: "CONFIGURATION_ERROR",
    })
  }

  const url = new URL(baseUrl)
  return new URL(path, `${url.href.replace(/\/$/, "")}/`).toString()
}

function buildPathWithQuery(
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>
): string {
  if (!query) {
    return path
  }

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "undefined" || value === null || value === "") {
      continue
    }
    search.set(key, String(value))
  }

  const queryString = search.toString()
  return queryString ? `${path}?${queryString}` : path
}

function shouldRetryWithIpv4Fallback(url: string): boolean {
  return url.includes("://localhost")
}

function buildRequestInit(options: RequestOptions): RequestInit {
  const authMode = options.authMode ?? "session"
  const token = authMode === "session" ? options.token ?? getStoredToken() : null
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData
  const hasBody = typeof options.body !== "undefined"

  return {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
    body: hasBody
      ? isFormData
        ? (options.body as FormData)
        : JSON.stringify(options.body)
      : undefined,
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "strict-origin-when-cross-origin",
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  if (typeof AbortController === "undefined") {
    return fetch(url, init)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function handleResponse<T>(response: Response, service: "backend" | "ai" | "unknown"): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
  const rawBody = await response.text()
  let payload: unknown

  try {
    payload = parseResponseBody(rawBody, contentType)
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ApiError(error.message, {
        code: error.code,
        status: response.status,
        service,
        retryable: error.retryable,
      })
    }
    throw error
  }

  if (!response.ok) {
    const message = contentType.includes("text/html")
      ? getDefaultErrorMessage(response.status)
      : extractMessageFromPayload(payload) ?? getDefaultErrorMessage(response.status)
    throw new ApiError(message, {
      code: mapStatusToErrorCode(response.status),
      status: response.status,
      service,
      details: payload,
      retryable: response.status >= 500 || response.status === 429,
    })
  }

  if (typeof payload === "undefined") {
    return undefined as T
  }

  if (contentType.includes("text/html")) {
    throw new ApiError("The server returned an unexpected HTML response.", {
      code: "INVALID_RESPONSE",
      status: response.status,
      service,
      retryable: false,
    })
  }

  return unwrapApiData<T>(payload)
}

function buildNetworkError(
  baseUrl: string,
  service: "backend" | "ai" | "unknown",
  error: unknown
): ApiError {
  const message =
    error instanceof DOMException && error.name === "AbortError"
      ? "The request timed out. Please try again."
      : `Cannot reach service at ${baseUrl}. Ensure the server is running and reachable.`

  return new ApiError(message, {
    code: error instanceof DOMException && error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
    service,
    retryable: true,
  })
}

async function requestJson<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
  const timeoutMs =
    typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_REQUEST_TIMEOUT_MS
  const service = options.service ?? (baseUrl === BACKEND_BASE_URL ? "backend" : baseUrl === AI_BASE_URL ? "ai" : "unknown")
  const requestInit = buildRequestInit(options)
  const primaryUrl = buildRequestUrl(baseUrl, path)
  const candidateUrls = shouldRetryWithIpv4Fallback(primaryUrl) ? [primaryUrl, toIpv4Localhost(primaryUrl)] : [primaryUrl]
  let lastError: unknown = null

  for (const candidateUrl of candidateUrls) {
    try {
      const response = await fetchWithTimeout(candidateUrl, requestInit, timeoutMs)
      return await handleResponse<T>(response, service)
    } catch (error) {
      if (error instanceof ApiError && error.code !== "NETWORK_ERROR" && error.code !== "TIMEOUT") {
        throw error
      }
      lastError = error
    }
  }

  if (lastError instanceof ApiError) {
    throw lastError
  }

  throw buildNetworkError(baseUrl, service, lastError)
}

export async function loginUser(email: string, password: string): Promise<LoginResponse> {
  return requestJson<LoginResponse>(BACKEND_BASE_URL, "/api/auth/login", {
    method: "POST",
    body: { email, password },
    authMode: "none",
  })
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return requestJson<{ message: string }>(BACKEND_BASE_URL, "/api/auth/forgot-password", {
    method: "POST",
    body: { email },
    authMode: "none",
  })
}

export async function resetPasswordWithToken(payload: {
  token: string
  new_password: string
}): Promise<{ message: string }> {
  return requestJson<{ message: string }>(BACKEND_BASE_URL, "/api/auth/reset-password", {
    method: "POST",
    body: payload,
    authMode: "none",
  })
}

export async function changeUserPassword(payload: {
  user_id: number
  current_password: string
  new_password: string
}): Promise<{ message: string }> {
  return requestJson<{ message: string }>(BACKEND_BASE_URL, "/api/auth/change-password", {
    method: "PUT",
    body: payload,
  })
}

export async function createTicket(payload: CreateTicketPayload): Promise<Ticket> {
  return requestJson<Ticket>(BACKEND_BASE_URL, "/api/tickets", {
    method: "POST",
    body: payload,
  })
}

export async function getUserTickets(employeeId: number): Promise<Ticket[]> {
  return requestJson<Ticket[]>(BACKEND_BASE_URL, buildPathWithQuery("/api/tickets", { employee_id: employeeId }))
}

export async function getAssignedTickets(technicianId: number): Promise<Ticket[]> {
  return requestJson<Ticket[]>(BACKEND_BASE_URL, `/api/tickets/assigned/${technicianId}`)
}

export async function getAllTickets(): Promise<Ticket[]> {
  return requestJson<Ticket[]>(BACKEND_BASE_URL, "/api/tickets")
}

export async function getTicketById(
  ticketId: number,
  options?: {
    technicianUserId?: number
  }
): Promise<TicketDetail> {
  return requestJson<TicketDetail>(
    BACKEND_BASE_URL,
    buildPathWithQuery(`/api/tickets/${ticketId}`, { technician_user_id: options?.technicianUserId })
  )
}

export async function getTicketMessages(ticketId: number): Promise<TicketMessagesResponse> {
  return requestJson<TicketMessagesResponse>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/messages`)
}

export async function createTicketMessage(
  ticketId: number,
  payload: {
    message_type: TicketMessageType
    content: string
    parent_message_id?: number | null
  }
): Promise<TicketMessage> {
  return requestJson<TicketMessage>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/messages`, {
    method: "POST",
    body: payload,
  })
}

export async function addDiscussionParticipant(
  ticketId: number,
  payload: { userId?: number; email?: string }
): Promise<DiscussionParticipant> {
  return requestJson<DiscussionParticipant>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/participants`, {
    method: "POST",
    body: {
      user_id: payload.userId,
      email: payload.email,
    },
  })
}

export async function assignTechnician(
  ticketId: number,
  technicianId: number | null,
  fromAdminFaultUserId: number
): Promise<Ticket> {
  return requestJson<Ticket>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/assign`, {
    method: "PUT",
    body: {
      technician_id: technicianId,
      from_admin_fault_user_id: fromAdminFaultUserId,
    },
  })
}

export async function updateTicketPriority(ticketId: number, priority: string): Promise<Ticket> {
  return requestJson<Ticket>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/priority`, {
    method: "PUT",
    body: { priority },
  })
}

export async function updateTicketStatus(
  ticketId: number,
  status: string,
  acceptedByAdminId?: number,
  technicianUserId?: number
): Promise<Ticket> {
  return requestJson<Ticket>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/status`, {
    method: "PUT",
    body: {
      status,
      accepted_by_admin_id: acceptedByAdminId,
      technician_user_id: technicianUserId,
    },
  })
}

export async function submitTicketProblemReview(
  ticketId: number,
  payload: {
    reporter_id: number
    approved: boolean
    rating: number
    review_comment?: string
  }
): Promise<Ticket> {
  return requestJson<Ticket>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/problem-review`, {
    method: "PUT",
    body: payload,
  })
}

export async function createTicketComment(
  ticketId: number,
  payload: {
    author_id: number
    comment: string
  }
): Promise<TicketComment> {
  return requestJson<TicketComment>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/comments`, {
    method: "POST",
    body: payload,
  })
}

export async function escalateTicket(
  ticketId: number,
  fromTechnicianUserId: number,
  targetTechnicianId: number | null,
  comment: string,
  targetRole?: UserRole
): Promise<Ticket> {
  return requestJson<Ticket>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/escalate`, {
    method: "PUT",
    body: {
      from_technician_user_id: fromTechnicianUserId,
      target_technician_id: targetTechnicianId,
      target_role: targetRole,
      comment,
    },
  })
}

export async function escalateTicketByAdmin(
  ticketId: number,
  adminFaultUserId: number,
  comment: string
): Promise<Ticket> {
  return requestJson<Ticket>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/escalate`, {
    method: "PUT",
    body: {
      from_admin_fault_user_id: adminFaultUserId,
      comment,
    },
  })
}

export async function getTechnicians(): Promise<Technician[]> {
  return requestJson<Technician[]>(BACKEND_BASE_URL, "/api/technicians")
}

export async function createTechnician(payload: {
  name: string
  email: string
  skillset: string
  is_available?: boolean
}): Promise<Technician> {
  return requestJson<Technician>(BACKEND_BASE_URL, "/api/technicians", {
    method: "POST",
    body: payload,
  })
}

export async function deleteTechnician(technicianId: number): Promise<void> {
  await requestJson<void>(BACKEND_BASE_URL, `/api/technicians/${technicianId}`, {
    method: "DELETE",
  })
}

export async function updateTechnicianStatus(technicianId: number, isActive: boolean): Promise<Technician> {
  return requestJson<Technician>(BACKEND_BASE_URL, `/api/technicians/${technicianId}`, {
    method: "PATCH",
    body: { is_active: isActive },
  })
}

export async function updateTechnicianDetails(
  technicianId: number,
  payload: {
    name: string
    email: string
    skillset: string
  }
): Promise<Technician> {
  return requestJson<Technician>(BACKEND_BASE_URL, `/api/technicians/${technicianId}`, {
    method: "PATCH",
    body: payload,
  })
}

export async function getEmployees(): Promise<Employee[]> {
  return requestJson<Employee[]>(BACKEND_BASE_URL, "/api/employees")
}

export async function createEmployee(payload: {
  name: string
  email: string
  branch?: string
  is_active?: boolean
}): Promise<Employee> {
  return requestJson<Employee>(BACKEND_BASE_URL, "/api/employees", {
    method: "POST",
    body: payload,
  })
}

export async function deleteEmployee(employeeId: number): Promise<void> {
  await requestJson<void>(BACKEND_BASE_URL, `/api/employees/${employeeId}`, {
    method: "DELETE",
  })
}

export async function updateEmployeeStatus(employeeId: number, isActive: boolean): Promise<Employee> {
  return requestJson<Employee>(BACKEND_BASE_URL, `/api/employees/${employeeId}`, {
    method: "PATCH",
    body: { is_active: isActive },
  })
}

export async function updateEmployeeDetails(
  employeeId: number,
  payload: {
    name: string
    email: string
    branch?: string
  }
): Promise<Employee> {
  return requestJson<Employee>(BACKEND_BASE_URL, `/api/employees/${employeeId}`, {
    method: "PATCH",
    body: payload,
  })
}

export async function setupPasswordWithInvite(payload: {
  token: string
  new_password: string
}): Promise<{ message: string }> {
  return requestJson<{ message: string }>(BACKEND_BASE_URL, "/api/auth/setup-password", {
    method: "POST",
    body: payload,
    authMode: "none",
  })
}

export async function getPerformanceMetrics(params: PerformanceMetricsQuery = {}): Promise<PerformanceMetrics> {
  return requestJson<PerformanceMetrics>(
    BACKEND_BASE_URL,
    buildPathWithQuery("/api/performance", {
      range: params.range,
      start_date: params.start_date,
      end_date: params.end_date,
    })
  )
}

export async function getDefaultBusinessHours(): Promise<BusinessHoursConfig> {
  return requestJson<BusinessHoursConfig>(BACKEND_BASE_URL, "/api/business-hours/default")
}

export async function updateDefaultBusinessHours(payload: {
  name: string
  description: string
  timezone: string
  groups: string[]
  schedule: BusinessHoursSchedule
  holidays: Array<{
    id?: number
    name: string
    date: string
  }>
  leaves: Array<{
    id?: number
    technician_id: number
    leave_type: string
    start_date: string
    end_date: string
  }>
}): Promise<BusinessHoursConfig> {
  return requestJson<BusinessHoursConfig>(BACKEND_BASE_URL, "/api/business-hours/default", {
    method: "PUT",
    body: payload,
  })
}

export async function getTicketMaterialRequests(ticketId: number): Promise<TicketMaterialRequest[]> {
  return requestJson<TicketMaterialRequest[]>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/material-requests`)
}

export async function createTicketMaterialRequest(
  ticketId: number,
  payload: {
    requested_by_id: number
    item_name: string
    quantity: number
    notes: string
  }
): Promise<TicketMaterialRequest> {
  return requestJson<TicketMaterialRequest>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/material-requests`, {
    method: "POST",
    body: payload,
  })
}

export async function getNotifications(userId?: number): Promise<NotificationsResponse> {
  void userId
  return requestJson<NotificationsResponse>(BACKEND_BASE_URL, "/api/notifications")
}

export async function markNotificationRead(notificationId: number): Promise<AppNotification> {
  return requestJson<AppNotification>(BACKEND_BASE_URL, `/api/notifications/${notificationId}/read`, {
    method: "PATCH",
  })
}

export async function markNotificationsRead(userId?: number, notificationIds?: number[]): Promise<{ unread_count: number }> {
  void userId
  if (Array.isArray(notificationIds) && notificationIds.length > 0) {
    await Promise.all(notificationIds.map((notificationId) => markNotificationRead(notificationId)))
  }
  const payload = await getNotifications()
  return { unread_count: payload.unread_count }
}

export async function getConsumables(): Promise<Consumable[]> {
  return requestJson<Consumable[]>(BACKEND_BASE_URL, "/api/consumables")
}

export async function addConsumable(payload: AddConsumablePayload): Promise<Consumable> {
  return requestJson<Consumable>(BACKEND_BASE_URL, "/api/consumables", {
    method: "POST",
    body: payload,
  })
}

export async function updateConsumable(id: number, payload: Partial<AddConsumablePayload>): Promise<Consumable> {
  return requestJson<Consumable>(BACKEND_BASE_URL, `/api/consumables/${id}`, {
    method: "PUT",
    body: payload,
  })
}

export async function adjustConsumableQuantity(id: number, delta: number): Promise<Consumable> {
  return requestJson<Consumable>(BACKEND_BASE_URL, `/api/consumables/${id}/adjust`, {
    method: "PATCH",
    body: { delta },
  })
}

export async function sendChatMessage(message: string): Promise<ChatbotResponse> {
  try {
    return await requestJson<ChatbotResponse>(AI_BASE_URL, "/ai-service/chat", {
      method: "POST",
      body: { message },
      authMode: "none",
      service: "ai",
    })
  } catch (error) {
    if (error instanceof ApiError && error.code !== "NETWORK_ERROR" && error.code !== "TIMEOUT") {
      throw error
    }
    return requestJson<ChatbotResponse>(BACKEND_BASE_URL, "/api/ai-service/chat", {
      method: "POST",
      body: { message },
      service: "backend",
    })
  }
}

export async function createAiIntakeDraft(payload: {
  message: string
  user_id?: number
  employee_id?: number
  branch?: string
  department?: string
  caller_name?: string
  channel?: string
}): Promise<TicketIntakeDraftResponse> {
  return requestJson<TicketIntakeDraftResponse>(BACKEND_BASE_URL, "/api/ai-intake/draft", {
    method: "POST",
    body: payload,
  })
}

export async function createVoiceTicketDraft(payload: {
  audio: Blob
  employee_id: number
  caller_name?: string
  transcript_hint?: string
  branch?: string
  department?: string
}): Promise<VoiceTicketDraftResponse> {
  const formData = new FormData()
  formData.append("audio", payload.audio, "call-recording.webm")
  formData.append("employee_id", String(payload.employee_id))
  if (payload.caller_name) {
    formData.append("caller_name", payload.caller_name)
  }
  if (payload.transcript_hint) {
    formData.append("transcript_hint", payload.transcript_hint)
  }
  if (payload.branch) {
    formData.append("branch", payload.branch)
  }
  if (payload.department) {
    formData.append("department", payload.department)
  }

  return requestJson<VoiceTicketDraftResponse>(BACKEND_BASE_URL, "/api/voice-to-ticket", {
    method: "POST",
    body: formData,
  })
}

export async function createConsumableRequest(payload: {
  itemName: string
  quantity: number
  assignment_type: ConsumableAssignmentType
  department: string
  notes: string
  employee_id: number
}): Promise<ConsumableRequest> {
  return requestJson<ConsumableRequest>(BACKEND_BASE_URL, "/api/consumable-requests", {
    method: "POST",
    body: payload,
  })
}

export async function getConsumableRequests(employeeId?: number): Promise<ConsumableRequest[]> {
  return requestJson<ConsumableRequest[]>(
    BACKEND_BASE_URL,
    buildPathWithQuery("/api/consumable-requests", { employee_id: employeeId })
  )
}

export async function approveConsumableRequestById(
  requestId: number,
  approvedById?: number,
  assignmentType?: ConsumableAssignmentType
): Promise<ConsumableRequest> {
  return requestJson<ConsumableRequest>(BACKEND_BASE_URL, `/api/consumable-requests/${requestId}/approve`, {
    method: "PUT",
    body: {
      approved_by_id: approvedById,
      assignment_type: assignmentType,
    },
  })
}

export async function rejectConsumableRequestById(
  requestId: number,
  reason: string,
  rejectedById?: number
): Promise<ConsumableRequest> {
  return requestJson<ConsumableRequest>(BACKEND_BASE_URL, `/api/consumable-requests/${requestId}/reject`, {
    method: "PUT",
    body: { reason, rejected_by_id: rejectedById },
  })
}

export async function getConsumableReturns(employeeId?: number): Promise<ConsumableReturn[]> {
  return requestJson<ConsumableReturn[]>(
    BACKEND_BASE_URL,
    buildPathWithQuery("/api/consumable-returns", { employee_id: employeeId })
  )
}

export async function createConsumableReturnRequest(payload: {
  consumable_request_id: number
  employee_id: number
  quantity: number
  reason: string
}): Promise<ConsumableReturn> {
  return requestJson<ConsumableReturn>(BACKEND_BASE_URL, "/api/consumable-returns", {
    method: "POST",
    body: payload,
  })
}

export async function receiveConsumableReturn(returnId: number, receivedById?: number): Promise<ConsumableReturn> {
  return requestJson<ConsumableReturn>(BACKEND_BASE_URL, `/api/consumable-returns/${returnId}/receive`, {
    method: "PUT",
    body: { received_by_id: receivedById },
  })
}

export async function rejectConsumableReturn(
  returnId: number,
  reason: string,
  rejectedById?: number
): Promise<ConsumableReturn> {
  return requestJson<ConsumableReturn>(BACKEND_BASE_URL, `/api/consumable-returns/${returnId}/reject`, {
    method: "PUT",
    body: { reason, rejected_by_id: rejectedById },
  })
}

