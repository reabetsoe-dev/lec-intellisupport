"use client"

import { useState } from "react"
import Image from "next/image"
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
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cover bg-center bg-no-repeat px-4 py-10"
      style={{ backgroundImage: "url('/power-infrastructure.jpg')" }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(2,6,17,0.78)_0%,rgba(4,18,45,0.78)_40%,rgba(6,27,68,0.8)_100%)]" />

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
                type="email"
                placeholder="name@lec.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 border-[#2C5D92]/60 bg-[#0A1D44]/85 text-[#EAF4FF] placeholder:text-[#8FAED4] focus-visible:border-[#5EBCE7] focus-visible:ring-[#5EBCE7]/40"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#C5DDF8]">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 border-[#2C5D92]/60 bg-[#0A1D44]/85 text-[#EAF4FF] placeholder:text-[#8FAED4] focus-visible:border-[#5EBCE7] focus-visible:ring-[#5EBCE7]/40"
                required
              />
            </div>

            {error ? <p className="text-sm text-[#FF8A8F]">{error}</p> : null}
            {forgotText ? <p className="text-sm text-[#B7CDE8]">{forgotText}</p> : null}

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full bg-gradient-to-r from-[#2AAFE6] to-[#167BC8] text-white hover:from-[#1D9CD0] hover:to-[#0D67AD]"
            >
              {loading ? "Signing in..." : "Login"}
            </Button>
          </form>

          <Button
            variant="ghost"
            className="w-full text-[#9DC5EA] hover:bg-[#0D2A59] hover:text-[#D6EAFF]"
            onClick={() => setForgotText("Contact IT support at support@lec.com to reset your password.")}
          >
            Forgot password
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

