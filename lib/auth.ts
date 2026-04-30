import { loginUser, type UserRole } from "@/lib/api"
export type { UserRole }

export type AuthUser = {
  id: number
  name: string
  login_identifier?: string
  role: UserRole
  must_change_password: boolean
  token: string
}

export const AUTH_SESSION_KEY = "lec_intellisupport_user"
export const LOGIN_MODE_QUERY_PARAM = "mode"
export const LOGIN_MODE_SWITCH = "switch"
export const LOGIN_SOURCE_QUERY_PARAM = "source"
export const LOGIN_SOURCE_TECHNICIAN_QR = "technician-qr"

type SearchParamsLike = {
  get(name: string): string | null
}

const dashboardByRole: Record<UserRole, string> = {
  employee: "/employee/dashboard",
  technician: "/technician/dashboard",
  admin_fault: "/admin-fault/dashboard",
  admin_consumables: "/admin-consumables/dashboard",
  manager: "/manager/dashboard",
}

export function getDashboardPathByRole(role: UserRole): string {
  return dashboardByRole[role]
}

export function buildTechnicianQrMainLoginHref(): string {
  const params = new URLSearchParams({
    [LOGIN_MODE_QUERY_PARAM]: LOGIN_MODE_SWITCH,
    [LOGIN_SOURCE_QUERY_PARAM]: LOGIN_SOURCE_TECHNICIAN_QR,
  })

  return `/login?${params.toString()}`
}

export function isSwitchLoginRequest(searchParams: SearchParamsLike | null | undefined): boolean {
  return searchParams?.get(LOGIN_MODE_QUERY_PARAM) === LOGIN_MODE_SWITCH
}

export function getTicketDetailPathByRole(role: UserRole, ticketId: number): string {
  if (role === "employee") {
    return `/employee/tickets/${ticketId}`
  }
  if (role === "technician") {
    return `/technician/tickets/${ticketId}`
  }
  if (role === "admin_fault") {
    return `/admin-fault/tickets/${ticketId}`
  }
  if (role === "admin_consumables") {
    return `/admin-consumables/tickets/${ticketId}`
  }
  return `/manager/tickets/${ticketId}`
}

export function getRoleLabel(role: UserRole): string {
  if (role === "admin_fault") {
    return "Admin Fault"
  }
  if (role === "admin_consumables") {
    return "Admin Consumables"
  }
  if (role === "manager") {
    return "Manager"
  }
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export function getDisplayUserName(user: Pick<AuthUser, "name" | "login_identifier">): string {
  const name = user.name?.trim()
  if (name && name.length > 0) {
    return name
  }
  const loginIdentifier = user.login_identifier?.trim()
  return loginIdentifier && loginIdentifier.length > 0 ? loginIdentifier : "User"
}

export function isRolePathAllowed(pathname: string, role: UserRole): boolean {
  if (pathname === "/dashboard") {
    return false
  }

  const allowedRootByRole: Record<UserRole, string> = {
    employee: "/employee",
    technician: "/technician",
    admin_fault: "/admin-fault",
    admin_consumables: "/admin-consumables",
    manager: "/manager",
  }

  return pathname.startsWith(allowedRootByRole[role])
}

export function persistUserSession(user: AuthUser): void {
  if (typeof window === "undefined") {
    return
  }
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user))
  window.dispatchEvent(new Event("lec-auth-session-change"))
}

export function clearUserSession(): void {
  if (typeof window === "undefined") {
    return
  }
  window.localStorage.removeItem(AUTH_SESSION_KEY)
  window.dispatchEvent(new Event("lec-auth-session-change"))
}

export function parseStoredUserSession(raw: string | null): AuthUser | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthUser>
    const validRoles: UserRole[] = ["employee", "technician", "admin_fault", "admin_consumables", "manager"]
    if (
      typeof parsed.id === "number" &&
      typeof parsed.name === "string" &&
      typeof parsed.role === "string" &&
      typeof parsed.must_change_password === "boolean" &&
      typeof parsed.token === "string" &&
      validRoles.includes(parsed.role as UserRole)
    ) {
      return {
        id: parsed.id,
        name: parsed.name,
        login_identifier: typeof parsed.login_identifier === "string" ? parsed.login_identifier : undefined,
        role: parsed.role as UserRole,
        must_change_password: parsed.must_change_password,
        token: parsed.token,
      }
    }
  } catch {
    return null
  }

  return null
}

export function getStoredUserSession(): AuthUser | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY)
    const parsed = parseStoredUserSession(raw)
    if (raw && parsed) {
      const current = JSON.parse(raw) as Partial<AuthUser>
      if (current.name !== parsed.name) {
        window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(parsed))
      }
    }
    if (!parsed && raw) {
      window.localStorage.removeItem(AUTH_SESSION_KEY)
    }
    return parsed
  } catch {
    return null
  }
}

export async function simulateLogin(email: string, password: string): Promise<AuthUser> {
  const loginIdentifier = email.trim()
  const user = await loginUser(loginIdentifier, password)
  return {
    id: user.id,
    name: user.name,
    login_identifier: loginIdentifier,
    role: user.role,
    must_change_password: Boolean(user.must_change_password),
    token: user.token,
  }
}
