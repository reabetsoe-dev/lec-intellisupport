"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"

import {
  clearUserSession,
  getDashboardPathByRole,
  isSwitchLoginRequest,
  LOGIN_NEXT_QUERY_PARAM,
  persistUserSession,
  sanitizeLoginNextPath,
  simulateLogin,
} from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isSwitchLoginMode = isSwitchLoginRequest(searchParams)
  const requestedNextPath = sanitizeLoginNextPath(searchParams.get(LOGIN_NEXT_QUERY_PARAM))
  const emailInputRef = useRef<HTMLInputElement | null>(null)
  const passwordInputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState("")
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isSwitchLoginMode) {
      return
    }

    clearUserSession()
    setError("")
    if (emailInputRef.current) {
      emailInputRef.current.value = ""
    }
    if (passwordInputRef.current) {
      passwordInputRef.current.value = ""
    }
    setIsPasswordVisible(false)
  }, [isSwitchLoginMode])

  const readLoginCredentials = () => {
    return {
      email: emailInputRef.current?.value.trim() ?? "",
      password: passwordInputRef.current?.value ?? "",
    }
  }

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { email, password } = readLoginCredentials()
    if (!email || !password.trim()) {
      setError("Enter email and password to continue.")
      return
    }

    setError("")
    setLoading(true)

    try {
      const user = await simulateLogin(email, password)
      persistUserSession(user)
      if (user.role === "employee" && user.must_change_password) {
        router.push("/employee/profile")
      } else if (requestedNextPath) {
        router.push(requestedNextPath)
      } else {
        router.push(getDashboardPathByRole(user.role))
      }
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Login failed."
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cover bg-center bg-no-repeat px-4 py-10"
      style={{ backgroundImage: "url('/power-infrastructure.jpg')" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(2,6,17,0.78)_0%,rgba(4,18,45,0.78)_40%,rgba(6,27,68,0.8)_100%)]" />

      <Card className="relative z-10 w-full max-w-md rounded-2xl border border-[#2A6FB2]/45 bg-[linear-gradient(180deg,rgba(8,30,66,0.88)_0%,rgba(5,20,47,0.92)_100%)] py-0 text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-md">
        <CardHeader className="space-y-2 px-8 py-7">
          <div className="mb-2 flex justify-center">
            <Image
              src="/lec-logo.png"
              alt="LEC logo"
              width={320}
              height={96}
              priority
              className="h-auto w-full max-w-[300px] object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.38)]"
            />
          </div>
          <CardTitle className="text-3xl font-semibold text-[#E5F1FF]">LEC IntelliSupport</CardTitle>
          <p className="text-sm text-[#6FC6E8]">Smart IT Service Management Platform</p>
        </CardHeader>
        <CardContent className="space-y-5 px-8 pb-8">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[#C5DDF8]">
                Email
              </Label>
              <Input
                id="email"
                ref={emailInputRef}
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="email"
                placeholder="name@lec.com"
                onInput={() => {
                  if (error) {
                    setError("")
                  }
                }}
                className="h-11 border-[#2C5D92]/60 bg-[#0A1D44]/85 text-[#EAF4FF] placeholder:text-[#8FAED4] focus-visible:border-[#5EBCE7] focus-visible:ring-[#5EBCE7]/40"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#C5DDF8]">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  ref={passwordInputRef}
                  name="password"
                  type={isPasswordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter password"
                  onInput={() => {
                    if (error) {
                      setError("")
                    }
                  }}
                  className="h-11 border-[#2C5D92]/60 bg-[#0A1D44]/85 pr-12 text-[#EAF4FF] placeholder:text-[#8FAED4] focus-visible:border-[#5EBCE7] focus-visible:ring-[#5EBCE7]/40"
                  required
                />
                <button
                  type="button"
                  aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                  aria-pressed={isPasswordVisible}
                  onClick={() => setIsPasswordVisible((currentValue) => !currentValue)}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#9DC5EA] transition hover:text-[#D6EAFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5EBCE7]/50"
                >
                  {isPasswordVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error ? <p className="text-sm text-[#FF8A8F]">{error}</p> : null}

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full touch-manipulation bg-gradient-to-r from-[#2AAFE6] to-[#167BC8] text-white hover:from-[#1D9CD0] hover:to-[#0D67AD]"
            >
              {loading ? "Signing in..." : "Login"}
            </Button>
          </form>

          <Link
            href="/forgot-password"
            className="block w-full rounded-md px-3 py-2 text-center text-[#9DC5EA] transition hover:bg-[#0D2A59] hover:text-[#D6EAFF]"
          >
            Forgot password
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

