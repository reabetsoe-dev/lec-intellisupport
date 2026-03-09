"use client"

import { useEffect } from "react"
import { useState } from "react"
import { usePathname } from "next/navigation"
import { useRouter } from "next/navigation"

import { ChatbotFaultAssistant } from "@/components/chatbot/ChatbotFaultAssistant"
import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/Topbar"
import {
  type AuthUser,
  getDashboardPathByRole,
  getStoredUserSession,
  isRolePathAllowed,
} from "@/lib/auth"

type AppShellProps = {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const isAuthPage = pathname.startsWith("/login")
  const [isHydrated, setIsHydrated] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    const refreshSession = () => setUser(getStoredUserSession())
    // Keep local state in sync if session changes in this or another tab.
    refreshSession()
    setIsHydrated(true)
    window.addEventListener("storage", refreshSession)
    window.addEventListener("lec-auth-session-change", refreshSession)
    return () => {
      window.removeEventListener("storage", refreshSession)
      window.removeEventListener("lec-auth-session-change", refreshSession)
    }
  }, [])

  useEffect(() => {
    if (isAuthPage && user) {
      const dashboardPath = getDashboardPathByRole(user.role)
      if (pathname !== dashboardPath) {
        router.replace(dashboardPath)
      }
      return
    }

    if (!isAuthPage && !user) {
      if (pathname !== "/login") {
        router.replace("/login")
      }
      return
    }

    if (!isAuthPage && user && !isRolePathAllowed(pathname, user.role)) {
      const dashboardPath = getDashboardPathByRole(user.role)
      if (pathname !== dashboardPath) {
        router.replace(dashboardPath)
      }
    }
  }, [isAuthPage, pathname, router, user])

  if (isAuthPage) {
    return <div className="min-h-screen bg-slate-950">{children}</div>
  }

  if (!isHydrated) {
    return null
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} />
      <div className="lec-shell-bg flex min-h-0 flex-1 flex-col">
        <Topbar user={user} />
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
        {user.role === "employee" ? <ChatbotFaultAssistant /> : null}
      </div>
    </div>
  )
}
