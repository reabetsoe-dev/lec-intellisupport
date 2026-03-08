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
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const refreshSession = () => setUser(getStoredUserSession())
    const timeoutId = window.setTimeout(refreshSession, 0)
    window.addEventListener("storage", refreshSession)
    window.addEventListener("lec-auth-session-change", refreshSession)
    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener("storage", refreshSession)
      window.removeEventListener("lec-auth-session-change", refreshSession)
    }
  }, [])

  useEffect(() => {
    if (isAuthPage && user) {
      router.replace(getDashboardPathByRole(user.role))
      return
    }

    if (!isAuthPage && !user) {
      router.replace("/login")
      return
    }

    if (!isAuthPage && user && !isRolePathAllowed(pathname, user.role)) {
      router.replace(getDashboardPathByRole(user.role))
    }
  }, [isAuthPage, pathname, router, user])

  if (isAuthPage) {
    return <div className="min-h-screen bg-slate-950">{children}</div>
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <div className="lec-shell-bg flex min-h-screen flex-1 flex-col">
        <Topbar user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
        {user.role === "employee" ? <ChatbotFaultAssistant /> : null}
      </div>
    </div>
  )
}
