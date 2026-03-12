export type UserRole = "employee" | "technician" | "admin_fault" | "admin_consumables"

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
  category: string
  location: string
  priority: string
  employee_id: number
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
  latest_escalation_comment?: string | null
  latest_escalation_by?: string | null
  latest_escalation_at?: string | null
  latest_escalation_target?: string | null
  is_currently_assigned_to_me?: boolean
  escalated_by_me?: boolean
  current_owner?: string | null
  created_at?: string
  updated_at?: string
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
  skillset: string
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

export type PerformanceMetrics = {
  kpis: {
    total_tickets: number
    open_tickets: number
    resolved_tickets: number
    critical_tickets: number
    unassigned_tickets: number
    resolved_rate: number
  }
  by_status: CountDatum[]
  by_priority: CountDatum[]
  by_category: CountDatum[]
  by_month: CountDatum[]
  by_technician: CountDatum[]
  generated_at: string
}

export type AppNotification = {
  id: number
  message: string
  is_read: boolean
  ticket_id?: number | null
  created_at: string
  read_at?: string | null
}

export type NotificationsResponse = {
  unread_count: number
  notifications: AppNotification[]
}

export type Consumable = {
  id: number
  asset_tag?: string | null
  item_name: string
  manufacturer?: string | null
  brand?: string | null
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

export type ConsumableRequest = {
  id: string
  db_id: number
  itemName: string
  quantity: number
  assignmentType: "new" | "loan" | "exchange"
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
  assignmentType: "new" | "loan" | "exchange"
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
}

function resolveServiceBaseUrl(envUrl: string | undefined, fallbackPort: number): string {
  if (envUrl && envUrl.trim()) {
    return envUrl.replace(/\/$/, "")
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:"
    return `${protocol}//${window.location.hostname}:${fallbackPort}`
  }

  return `http://127.0.0.1:${fallbackPort}`
}

const BACKEND_BASE_URL = resolveServiceBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL, 8000)
const AI_BASE_URL = resolveServiceBaseUrl(process.env.NEXT_PUBLIC_AI_SERVICE_URL, 8001)

function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const raw = window.localStorage.getItem("lec_intellisupport_user")
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as { token?: string }
    return typeof parsed.token === "string" ? parsed.token : null
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

async function requestJson<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.token ?? getStoredToken()
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new Error(`Cannot reach service at ${baseUrl}. Ensure backend/AI server is running.`)
  }

  if (!response.ok) {
    let message = `Request failed: ${response.status}`
    const errorText = await response.text()
    if (errorText) {
      try {
        const errorPayload = JSON.parse(errorText) as { message?: unknown }
        if (errorPayload && typeof errorPayload === "object" && "message" in errorPayload) {
          message = String(errorPayload.message)
        } else {
          message = errorText
        }
      } catch {
        message = errorText
      }
    }
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const payload = await response.json()
  return unwrapApiData<T>(payload)
}

export async function loginUser(email: string, password: string): Promise<LoginResponse> {
  return requestJson<LoginResponse>(BACKEND_BASE_URL, "/api/auth/login", {
    method: "POST",
    body: { email, password },
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
  return requestJson<Ticket[]>(BACKEND_BASE_URL, `/api/tickets?employee_id=${employeeId}`)
}

export async function getAssignedTickets(technicianId: number): Promise<Ticket[]> {
  return requestJson<Ticket[]>(BACKEND_BASE_URL, `/api/tickets/assigned/${technicianId}`)
}

export async function getAllTickets(): Promise<Ticket[]> {
  return requestJson<Ticket[]>(BACKEND_BASE_URL, "/api/tickets")
}

export async function getTicketById(ticketId: number): Promise<TicketDetail> {
  return requestJson<TicketDetail>(BACKEND_BASE_URL, `/api/tickets/${ticketId}`)
}

export async function assignTechnician(ticketId: number, technicianId: number | null): Promise<Ticket> {
  return requestJson<Ticket>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/assign`, {
    method: "PUT",
    body: { technician_id: technicianId },
  })
}

export async function updateTicketPriority(ticketId: number, priority: string): Promise<Ticket> {
  return requestJson<Ticket>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/priority`, {
    method: "PUT",
    body: { priority },
  })
}

export async function updateTicketCategory(ticketId: number, category: string): Promise<Ticket> {
  return requestJson<Ticket>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/category`, {
    method: "PUT",
    body: { category },
  })
}

export async function updateTicketStatus(ticketId: number, status: string): Promise<Ticket> {
  return requestJson<Ticket>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/status`, {
    method: "PUT",
    body: { status },
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
  targetTechnicianId: number,
  comment: string
): Promise<Ticket> {
  return requestJson<Ticket>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/escalate`, {
    method: "PUT",
    body: {
      from_admin_fault_user_id: adminFaultUserId,
      target_technician_id: targetTechnicianId,
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
  password: string
  branch?: string
  skillset?: string
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

export async function getEmployees(): Promise<Employee[]> {
  return requestJson<Employee[]>(BACKEND_BASE_URL, "/api/employees")
}

export async function createEmployee(payload: {
  name: string
  email: string
  password: string
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

export async function getPerformanceMetrics(): Promise<PerformanceMetrics> {
  return requestJson<PerformanceMetrics>(BACKEND_BASE_URL, "/api/performance")
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

export async function getNotifications(userId: number): Promise<NotificationsResponse> {
  return requestJson<NotificationsResponse>(BACKEND_BASE_URL, `/api/notifications?user_id=${userId}`)
}

export async function markNotificationsRead(userId: number, notificationIds?: number[]): Promise<{ unread_count: number }> {
  return requestJson<{ unread_count: number }>(BACKEND_BASE_URL, "/api/notifications/mark-read", {
    method: "PUT",
    body: { user_id: userId, notification_ids: notificationIds },
  })
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

export async function sendChatMessage(message: string): Promise<{ reply: string }> {
  try {
    return await requestJson<{ reply: string }>(AI_BASE_URL, "/ai-service/chat", {
      method: "POST",
      body: { message },
    })
  } catch {
    return requestJson<{ reply: string }>(BACKEND_BASE_URL, "/api/ai-service/chat", {
      method: "POST",
      body: { message },
    })
  }
}

export async function createConsumableRequest(payload: {
  itemName: string
  quantity: number
  assignment_type?: "new" | "loan" | "exchange"
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
  const query = employeeId ? `?employee_id=${employeeId}` : ""
  return requestJson<ConsumableRequest[]>(BACKEND_BASE_URL, `/api/consumable-requests${query}`)
}

export async function approveConsumableRequestById(
  requestId: number,
  approvedById?: number,
  assignmentType?: "new" | "loan" | "exchange"
): Promise<ConsumableRequest> {
  return requestJson<ConsumableRequest>(BACKEND_BASE_URL, `/api/consumable-requests/${requestId}/approve`, {
    method: "PUT",
    body: { approved_by_id: approvedById, assignment_type: assignmentType },
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
  const query = employeeId ? `?employee_id=${employeeId}` : ""
  return requestJson<ConsumableReturn[]>(BACKEND_BASE_URL, `/api/consumable-returns${query}`)
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

export async function rejectConsumableReturn(returnId: number, reason: string, rejectedById?: number): Promise<ConsumableReturn> {
  return requestJson<ConsumableReturn>(BACKEND_BASE_URL, `/api/consumable-returns/${returnId}/reject`, {
    method: "PUT",
    body: { reason, rejected_by_id: rejectedById },
  })
}
