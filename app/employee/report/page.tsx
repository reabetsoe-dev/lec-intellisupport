"use client"

import { useState } from "react"

import { ChatbotFaultAssistant } from "@/components/chatbot/ChatbotFaultAssistant"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { createTicket } from "@/lib/api"
import { getStoredUserSession } from "@/lib/auth"

export default function EmployeeReportPage() {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("Network")
  const [location, setLocation] = useState("")
  const [priority, setPriority] = useState("Low")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const handleCreateTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setMessage("")

    const user = getStoredUserSession()
    if (!user) {
      setError("Session expired. Please login again.")
      return
    }

    try {
      setSubmitting(true)
      const ticket = await createTicket({
        title,
        description,
        category,
        location,
        priority,
        employee_id: user.id,
      })
      setMessage(`Ticket #${ticket.id} created successfully.`)
      setTitle("")
      setDescription("")
      setCategory("Network")
      setLocation("")
      setPriority("Low")
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create ticket.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Report a Fault</h2>
        <p className="mt-1 text-sm text-slate-500">
          Chat with IntelliSupport AI first. If unresolved, submit the manual fault form.
        </p>
      </div>

      <ChatbotFaultAssistant />

      <Card id="manual-fault-form" className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 px-6 py-5">
          <CardTitle className="text-base font-semibold text-slate-900">Manual Fault Reporting Form</CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-6">
          <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleCreateTicket}>
          <div className="space-y-2 md:col-span-2">
            <label htmlFor="fault-title" className="text-sm font-medium text-slate-700">
              Title
            </label>
            <Input
              id="fault-title"
              placeholder="Issue summary"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="fault-description" className="text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              id="fault-description"
              placeholder="Describe the fault and impact"
              className="min-h-32 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="fault-category" className="text-sm font-medium text-slate-700">
              Category
            </label>
            <select
              id="fault-category"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option>Network</option>
              <option>Application</option>
              <option>Endpoint</option>
              <option>Access Management</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="fault-location" className="text-sm font-medium text-slate-700">
              Location
            </label>
            <Input
              id="fault-location"
              placeholder="Building or remote site"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="priority-suggestion" className="text-sm font-medium text-slate-700">
              Priority suggestion
            </label>
            <select
              id="priority-suggestion"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
          </div>

          {error ? <p className="md:col-span-2 text-sm text-rose-600">{error}</p> : null}
          {message ? <p className="md:col-span-2 text-sm text-emerald-700">{message}</p> : null}

          <div className="md:col-span-2">
            <Button type="submit" disabled={submitting} className="bg-slate-900 text-white hover:bg-slate-800">
              {submitting ? "Submitting..." : "Submit Ticket"}
            </Button>
          </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
