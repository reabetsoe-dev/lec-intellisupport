import { loginUser, type UserRole } from "@/lib/api"
export type { UserRole }

export type AuthUser = {
  id: number
  name: string
  role: UserRole
  token: string
}

export const AUTH_SESSION_KEY = "lec_intellisupport_user"

const dashboardByRole: Record<UserRole, string> = {
  employee: "/employee/dashboard",
  technician: "/technician/dashboard",
  admin_fault: "/admin-fault/dashboard",
  admin_consumables: "/admin-consumables",
}

export function getDashboardPathByRole(role: UserRole): string {
  return dashboardByRole[role]
}

export function getRoleLabel(role: UserRole): string {
  if (role === "admin_fault") {
    return "Admin Fault"
  }
  if (role === "admin_consumables") {
    return "Admin Consumables"
  }
  return role.charAt(0).toUpperCase() + role.slice(1)
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
    const validRoles: UserRole[] = ["employee", "technician", "admin_fault", "admin_consumables"]
    if (
      typeof parsed.id === "number" &&
      typeof parsed.name === "string" &&
      typeof parsed.role === "string" &&
      typeof parsed.token === "string" &&
      validRoles.includes(parsed.role as UserRole)
    ) {
      return {
        id: parsed.id,
        name: parsed.name,
        role: parsed.role as UserRole,
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
    if (!parsed && raw) {
      window.localStorage.removeItem(AUTH_SESSION_KEY)
    }
    return parsed
  } catch {
    return null
  }
}

export async function simulateLogin(email: string, password: string): Promise<AuthUser> {
  const user = await loginUser(email.trim(), password)
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    token: user.token,
  }
}
