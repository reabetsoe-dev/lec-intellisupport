"use client"

import { FormEvent, useEffect, useState } from "react"

import { createTechnician, getTechnicians, type Technician } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export function TechnicianManagementPanel() {
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [skillset, setSkillset] = useState("")
  const [isAvailable, setIsAvailable] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const loadTechnicians = async () => {
    const data = await getTechnicians()
    setTechnicians(data)
  }

  useEffect(() => {
    loadTechnicians().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Failed to load technicians.")
    })
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setSuccess("")

    try {
      setSaving(true)
      await createTechnician({
        name: name.trim(),
        email: email.trim(),
        password,
        skillset: skillset.trim(),
        is_available: isAvailable,
      })
      setName("")
      setEmail("")
      setPassword("")
      setSkillset("")
      setIsAvailable(true)
      setSuccess("Technician created successfully.")
      await loadTechnicians()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create technician.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 px-6 py-5">
        <CardTitle className="text-base font-semibold text-slate-900">Technician Management</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 px-6 py-6">
        <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="technician-name" className="text-sm font-medium text-slate-700">
              Name
            </label>
            <Input
              id="technician-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jane Doe"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="technician-email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <Input
              id="technician-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jane.tech@lec.com"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="technician-password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <Input
              id="technician-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Set initial password"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="technician-skillset" className="text-sm font-medium text-slate-700">
              Skillset
            </label>
            <Input
              id="technician-skillset"
              value={skillset}
              onChange={(event) => setSkillset(event.target.value)}
              placeholder="Network, Endpoint, SAP"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="technician-availability" className="text-sm font-medium text-slate-700">
              Availability
            </label>
            <select
              id="technician-availability"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
              value={isAvailable ? "available" : "unavailable"}
              onChange={(event) => setIsAvailable(event.target.value === "available")}
            >
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>

          {error ? <p className="text-sm text-rose-600 md:col-span-2">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-700 md:col-span-2">{success}</p> : null}

          <div className="md:col-span-2">
            <Button type="submit" disabled={saving} className="bg-slate-900 text-white hover:bg-slate-800">
              {saving ? "Creating..." : "Add Technician"}
            </Button>
          </div>
        </form>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-800">Current Technicians</p>
          {technicians.length === 0 ? (
            <p className="text-sm text-slate-500">No technicians found.</p>
          ) : (
            <div className="space-y-2">
              {technicians.map((technician) => (
                <div
                  key={technician.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{technician.name}</p>
                    <p className="text-xs text-slate-600">{technician.email}</p>
                    {technician.skillset ? <p className="text-xs text-slate-500">{technician.skillset}</p> : null}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      technician.is_available
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }
                  >
                    {technician.is_available ? "Available" : "Unavailable"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
