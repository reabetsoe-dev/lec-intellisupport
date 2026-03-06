export type UserRole = "employee" | "technician" | "admin_fault" | "admin_consumables"

export type LoginResponse = {
  id: number
  name: string
  role: UserRole
  token: string
}

export type CreateTicketPayload = {
  title: string
  description: string
  category: string
  location: string
  priority: string
  employee_id: number
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
  technician_id?: number | null
  technician_name?: string | null
  employee_name?: string | null
  created_at?: string
}

export type Consumable = {
  id: number
  item_name: string
  brand?: string | null
  model_number?: string | null
  serial_number?: string | null
  category?: string | null
  quantity: number
  department?: string | null
  condition?: string | null
  status?: string | null
  purchase_date?: string | null
  assigned_employee?: string | null
}

export type ConsumableRequest = {
  id: string
  db_id: number
  itemName: string
  quantity: number
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

type AddConsumablePayload = {
  item_name: string
  brand?: string
  model_number?: string
  serial_number?: string
  category?: string
  quantity: number
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

const BACKEND_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "")
const AI_BASE_URL = (process.env.NEXT_PUBLIC_AI_SERVICE_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "")

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
    try {
      const errorPayload = await response.json()
      if (errorPayload && typeof errorPayload === "object" && "message" in errorPayload) {
        message = String((errorPayload as { message: unknown }).message)
      }
    } catch {
      const text = await response.text()
      if (text) {
        message = text
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

export async function updateTicketStatus(ticketId: number, status: string): Promise<Ticket> {
  return requestJson<Ticket>(BACKEND_BASE_URL, `/api/tickets/${ticketId}/status`, {
    method: "PUT",
    body: { status },
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
  approvedById?: number
): Promise<ConsumableRequest> {
  return requestJson<ConsumableRequest>(BACKEND_BASE_URL, `/api/consumable-requests/${requestId}/approve`, {
    method: "PUT",
    body: { approved_by_id: approvedById },
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
