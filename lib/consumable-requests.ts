export type ConsumableRequestStatus = "pending" | "approved" | "rejected"

export type ConsumableRequest = {
  id: string
  itemName: string
  quantity: number
  department: string
  notes: string
  requestedBy: string
  requestedAt: string
  status: ConsumableRequestStatus
  approvedBy?: string
  approvedAt?: string
  rejectedBy?: string
  rejectedAt?: string
  rejectionReason?: string
}

const CONSUMABLE_REQUESTS_KEY = "lec_intellisupport_consumable_requests"

const initialRequests: ConsumableRequest[] = [
  {
    id: "CR-1001",
    itemName: "Cartridges",
    quantity: 3,
    department: "Finance",
    notes: "Printer queue is delayed due to low toner.",
    requestedBy: "Lebo M.",
    requestedAt: "2026-03-04T07:20:00.000Z",
    status: "pending",
  },
  {
    id: "CR-1000",
    itemName: "Mouse",
    quantity: 2,
    department: "Contact Center",
    notes: "Replacement for faulty units.",
    requestedBy: "Lebo M.",
    requestedAt: "2026-03-03T09:00:00.000Z",
    status: "approved",
    approvedBy: "Anele K.",
    approvedAt: "2026-03-03T09:45:00.000Z",
  },
]

function isBrowser(): boolean {
  return typeof window !== "undefined"
}

function sortNewestFirst(requests: ConsumableRequest[]): ConsumableRequest[] {
  return [...requests].sort(
    (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
  )
}

function persist(requests: ConsumableRequest[]): void {
  if (!isBrowser()) {
    return
  }
  window.localStorage.setItem(CONSUMABLE_REQUESTS_KEY, JSON.stringify(requests))
}

export function getConsumableRequests(): ConsumableRequest[] {
  if (!isBrowser()) {
    return initialRequests
  }

  const raw = window.localStorage.getItem(CONSUMABLE_REQUESTS_KEY)
  if (!raw) {
    persist(initialRequests)
    return sortNewestFirst(initialRequests)
  }

  try {
    const parsed = JSON.parse(raw) as ConsumableRequest[]
    if (Array.isArray(parsed)) {
      return sortNewestFirst(parsed)
    }
  } catch {
    persist(initialRequests)
  }

  return sortNewestFirst(initialRequests)
}

type CreateConsumableRequestInput = {
  itemName: string
  quantity: number
  department: string
  notes: string
  requestedBy: string
}

export function createConsumableRequest(input: CreateConsumableRequestInput): ConsumableRequest {
  const requests = getConsumableRequests()
  const nextRequestNumber =
    requests.reduce((max, request) => Math.max(max, Number(request.id.replace("CR-", "")) || 0), 1000) + 1

  const newRequest: ConsumableRequest = {
    id: `CR-${nextRequestNumber}`,
    itemName: input.itemName,
    quantity: input.quantity,
    department: input.department.trim(),
    notes: input.notes.trim(),
    requestedBy: input.requestedBy,
    requestedAt: new Date().toISOString(),
    status: "pending",
  }

  const updated = sortNewestFirst([newRequest, ...requests])
  persist(updated)
  return newRequest
}

export function approveConsumableRequest(requestId: string, approvedBy: string): ConsumableRequest | null {
  const requests = getConsumableRequests()
  const target = requests.find((request) => request.id === requestId)
  if (!target || target.status !== "pending") {
    return null
  }

  const updated = sortNewestFirst(
    requests.map((request) =>
      request.id === requestId
        ? {
            ...request,
            status: "approved",
            approvedBy,
            approvedAt: new Date().toISOString(),
          }
        : request
    )
  )

  persist(updated)
  return updated.find((request) => request.id === requestId) ?? null
}

export function rejectConsumableRequest(
  requestId: string,
  rejectedBy: string,
  rejectionReason: string
): ConsumableRequest | null {
  const requests = getConsumableRequests()
  const target = requests.find((request) => request.id === requestId)
  if (!target || target.status !== "pending") {
    return null
  }

  const reason = rejectionReason.trim()
  if (!reason) {
    return null
  }

  const updated = sortNewestFirst(
    requests.map((request) =>
      request.id === requestId
        ? {
            ...request,
            status: "rejected",
            rejectedBy,
            rejectedAt: new Date().toISOString(),
            rejectionReason: reason,
          }
        : request
    )
  )

  persist(updated)
  return updated.find((request) => request.id === requestId) ?? null
}
