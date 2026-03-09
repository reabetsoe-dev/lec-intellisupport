"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { getDashboardPathByRole, persistUserSession, simulateLogin } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [forgotText, setForgotText] = useState("")
  const [loading, setLoading] = useState(false)

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setForgotText("")
    setLoading(true)

    try {
      const user = await simulateLogin(email, password)
      persistUserSession(user)
      if (user.role === "employee" && user.must_change_password) {
        router.push("/employee/profile")
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
      className="relative flex min-h-screen items-center justify-center bg-cover bg-center bg-no-repeat px-4 py-10"
      style={{ backgroundImage: "url('/power-infrastructure.jpg')" }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[rgba(8,20,44,0.80)] to-[rgba(11,31,58,0.68)]" />

      <Card className="relative z-10 w-full max-w-md rounded-lg border-[#0072CE]/35 bg-white/90 py-0 text-slate-900 shadow-xl backdrop-blur-md">
        <CardHeader className="space-y-2 px-8 py-7">
          <p className="text-xs font-semibold tracking-[0.12em] text-[#D71920] uppercase">Enterprise ITSM</p>
          <CardTitle className="text-2xl font-semibold text-[#0B1F3A]">LEC-Intelli-Support</CardTitle>
          <p className="text-sm text-[#1E3A6D]">Enterprise IT Service Management for LEC</p>
        </CardHeader>
        <CardContent className="space-y-5 px-8 pb-8">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[#0B1F3A]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="name@lec.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="border-[#0072CE]/35 bg-white text-slate-900 placeholder:text-slate-400"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#0B1F3A]">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="border-[#0072CE]/35 bg-white text-slate-900 placeholder:text-slate-400"
                required
              />
            </div>

            {error ? <p className="text-sm text-[#D71920]">{error}</p> : null}
            {forgotText ? <p className="text-sm text-slate-700">{forgotText}</p> : null}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#0072CE] to-[#0B1F3A] text-white hover:from-[#0A63AD] hover:to-[#09172D]"
            >
              {loading ? "Signing in..." : "Login"}
            </Button>
          </form>

          <Button
            variant="ghost"
            className="w-full text-[#D71920] hover:bg-[#D71920]/10 hover:text-[#B3141A]"
            onClick={() => setForgotText("Contact IT support at support@lec.com to reset your password.")}
          >
            Forgot password
          </Button>

          <div className="rounded-lg border border-[#0072CE]/25 bg-white/80 p-3 text-xs text-slate-700">
            <p className="font-semibold text-[#0B1F3A]">Connected Login</p>
            <p className="mt-1">Credentials are validated by the backend service.</p>
            <p className="mt-1">On success you are redirected by your backend role.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
