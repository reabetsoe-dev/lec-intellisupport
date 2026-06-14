"use client"

import { Suspense, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { ChatbotFaultAssistant } from "@/components/chatbot/ChatbotFaultAssistant"
import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/Topbar"
import {
  type AuthUser,
  getDisplayUserName,
  getDashboardPathByRole,
  getStoredUserSession,
  isSwitchLoginRequest,
  isRolePathAllowed,
} from "@/lib/auth"

type AppShellProps = {
  children: React.ReactNode
}

function AppShellContent({ children }: AppShellProps) {
  const rawPathname = usePathname()
  const pathname = rawPathname ?? ""
  const searchParams = useSearchParams()
  const router = useRouter()
  const isLoginPage = pathname.startsWith("/login")
  const isForgotPasswordPage = pathname.startsWith("/forgot-password")
  const isResetPasswordPage = pathname.startsWith("/reset-password")
  const isSetPasswordPage = pathname.startsWith("/set-password")
  const isAssetScanPage = pathname.startsWith("/asset-scan/")
  const isAssetQrReportPage = pathname.startsWith("/asset-qr/report/")
  const isTechnicianAccessPage = pathname.startsWith("/technician-access")
  const isSwitchLoginMode = isLoginPage && isSwitchLoginRequest(searchParams)
  const isPublicPage =
    pathname === "/" ||
    isLoginPage ||
    isForgotPasswordPage ||
    isResetPasswordPage ||
    isSetPasswordPage ||
    isAssetScanPage ||
    isAssetQrReportPage ||
    isTechnicianAccessPage
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)

  useEffect(() => {
    const refreshSession = () => setUser(getStoredUserSession())
    refreshSession()
    window.addEventListener("storage", refreshSession)
    window.addEventListener("lec-auth-session-change", refreshSession)
    return () => {
      window.removeEventListener("storage", refreshSession)
      window.removeEventListener("lec-auth-session-change", refreshSession)
    }
  }, [])

  useEffect(() => {
    if (!isPublicPage && user?.role === "employee" && user.must_change_password && pathname !== "/employee/profile") {
      router.replace("/employee/profile")
      return
    }

    if (isLoginPage && user && !isSwitchLoginMode) {
      const dashboardPath = user.role === "employee" && user.must_change_password ? "/employee/profile" : getDashboardPathByRole(user.role)
      if (pathname !== dashboardPath) {
        router.replace(dashboardPath)
      }
      return
    }

    if (!isPublicPage && !user) {
      if (pathname !== "/login") {
        router.replace("/login")
      }
      return
    }

    if (!isPublicPage && user && !isRolePathAllowed(pathname, user.role)) {
      const dashboardPath = getDashboardPathByRole(user.role)
      if (pathname !== dashboardPath) {
        router.replace(dashboardPath)
      }
    }
  }, [isLoginPage, isPublicPage, isSwitchLoginMode, pathname, router, user])

  if (isPublicPage) {
    return <>{children}</>
  }

  if (user === undefined) {
    return null
  }

  if (!user) {
    return null
  }

  const displayUserName = getDisplayUserName(user)

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden md:h-screen md:flex-row md:overflow-hidden">
      <Sidebar user={user} />
      <div className="lec-shell-bg flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar user={user} />
        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 pb-24 sm:px-4 md:p-6 md:pb-6">
          <div className="mx-auto min-w-0 w-full max-w-[1400px]">
            {children}
          </div>
        </main>
        {user.role === "employee" ? (
          <ChatbotFaultAssistant key={`employee-chat-${user.id}`} accountName={displayUserName} accountId={user.id} />
        ) : null}
      </div>
    </div>
  )
}

export function AppShell({ children }: AppShellProps) {
  return (
    <Suspense fallback={<>{children}</>}>
      <AppShellContent>{children}</AppShellContent>
    </Suspense>
  )
}
