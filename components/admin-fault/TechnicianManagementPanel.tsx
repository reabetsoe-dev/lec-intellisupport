"use client"

import { FormEvent, useEffect, useState } from "react"

import {
  createEmployee,
  createTechnician,
  deleteEmployee,
  deleteTechnician,
  getEmployees,
  getTechnicians,
  type Employee,
  type Technician,
} from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const skillsetOptions = [
  "IT Support Technician",
  "Network Technician",
  "Systems Administrator",
  "SCADA Support Technician",
  "Metering Technician",
  "Distribution Line Technician",
  "Substation Technician",
  "Protection & Control Technician",
  "Power Systems Technician",
  "Customer Service Systems Technician",
  "Field Service Technician",
  "Cybersecurity Technician",
]

const branchOptions = [
  "Maseru",
  "Mafeteng",
  "Mohale's Hoek",
  "Quthing",
  "Qacha's Nek",
  "Leribe (Hlotse)",
  "Butha-Buthe",
  "Berea (Teyateyaneng)",
  "Thaba-Tseka",
  "Mokhotlong",
]

export function TechnicianManagementPanel() {
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [technicianBranch, setTechnicianBranch] = useState("")
  const [skillset, setSkillset] = useState("")
  const [isAvailable, setIsAvailable] = useState(true)
  const [employeeName, setEmployeeName] = useState("")
  const [employeeEmail, setEmployeeEmail] = useState("")
  const [employeePassword, setEmployeePassword] = useState("")
  const [employeeBranch, setEmployeeBranch] = useState("")
  const [employeeActive, setEmployeeActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingEmployee, setSavingEmployee] = useState(false)
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<number | null>(null)
  const [deletingTechnicianId, setDeletingTechnicianId] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const loadTechnicians = async () => {
    const data = await getTechnicians()
    setTechnicians(data)
  }

  const handleDeleteEmployee = async (employee: Employee) => {
    const confirmed = window.confirm(`Delete employee ${employee.name}? This cannot be undone.`)
    if (!confirmed) {
      return
    }
    try {
      setError("")
      setSuccess("")
      setDeletingEmployeeId(employee.id)
      await deleteEmployee(employee.id)
      setSuccess(`Employee ${employee.name} deleted.`)
      await loadEmployees()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete employee.")
    } finally {
      setDeletingEmployeeId(null)
    }
  }

  const handleDeleteTechnician = async (technician: Technician) => {
    const confirmed = window.confirm(`Delete technician ${technician.name}? This cannot be undone.`)
    if (!confirmed) {
      return
    }
    try {
      setError("")
      setSuccess("")
      setDeletingTechnicianId(technician.id)
      await deleteTechnician(technician.id)
      setSuccess(`Technician ${technician.name} deleted.`)
      await loadTechnicians()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete technician.")
    } finally {
      setDeletingTechnicianId(null)
    }
  }
  const loadEmployees = async () => {
    const data = await getEmployees()
    setEmployees(data)
  }

  useEffect(() => {
    Promise.all([loadTechnicians(), loadEmployees()]).catch((loadError) => {
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
        branch: technicianBranch,
        skillset: skillset.trim(),
        is_available: isAvailable,
      })
      setName("")
      setEmail("")
      setPassword("")
      setTechnicianBranch("")
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

  const handleEmployeeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setSuccess("")
    try {
      setSavingEmployee(true)
      await createEmployee({
        name: employeeName.trim(),
        email: employeeEmail.trim(),
        password: employeePassword,
        branch: employeeBranch,
        is_active: employeeActive,
      })
      setEmployeeName("")
      setEmployeeEmail("")
      setEmployeePassword("")
      setEmployeeBranch("")
      setEmployeeActive(true)
      setSuccess("Employee created successfully.")
      await loadEmployees()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create employee.")
    } finally {
      setSavingEmployee(false)
    }
  }

  return (
    <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 px-6 py-5">
        <CardTitle className="text-base font-semibold text-slate-900">User & Technician Management</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 px-6 py-6">
        <form className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2" onSubmit={handleEmployeeSubmit}>
          <div className="space-y-2">
            <label htmlFor="employee-name" className="text-sm font-medium text-slate-700">
              Employee Name
            </label>
            <Input
              id="employee-name"
              value={employeeName}
              onChange={(event) => setEmployeeName(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="employee-email" className="text-sm font-medium text-slate-700">
              Employee Email
            </label>
            <Input
              id="employee-email"
              type="email"
              value={employeeEmail}
              onChange={(event) => setEmployeeEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="employee-password" className="text-sm font-medium text-slate-700">
              Employee Password
            </label>
            <Input
              id="employee-password"
              type="password"
              value={employeePassword}
              onChange={(event) => setEmployeePassword(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="employee-branch" className="text-sm font-medium text-slate-700">
              Employee Branch
            </label>
            <select
              id="employee-branch"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
              value={employeeBranch}
              onChange={(event) => setEmployeeBranch(event.target.value)}
              required
            >
              <option value="">Select branch</option>
              {branchOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="employee-status" className="text-sm font-medium text-slate-700">
              Employee Status
            </label>
            <select
              id="employee-status"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
              value={employeeActive ? "active" : "inactive"}
              onChange={(event) => setEmployeeActive(event.target.value === "active")}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={savingEmployee} className="bg-slate-900 text-white hover:bg-slate-800">
              {savingEmployee ? "Creating..." : "Add Employee"}
            </Button>
          </div>
        </form>

        <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="technician-name" className="text-sm font-medium text-slate-700">
              Name
            </label>
            <Input
              id="technician-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
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
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="technician-branch" className="text-sm font-medium text-slate-700">
              Branch
            </label>
            <select
              id="technician-branch"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
              value={technicianBranch}
              onChange={(event) => setTechnicianBranch(event.target.value)}
              required
            >
              <option value="">Select branch</option>
              {branchOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="technician-skillset" className="text-sm font-medium text-slate-700">
              Skillset
            </label>
            <select
              id="technician-skillset"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
              value={skillset}
              onChange={(event) => setSkillset(event.target.value)}
            >
              <option value="">Select skillset</option>
              {skillsetOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
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
          <p className="text-sm font-semibold text-slate-800">Current Employees</p>
          {employees.length === 0 ? (
            <p className="text-sm text-slate-500">No employees found.</p>
          ) : (
            <div className="space-y-2">
              {employees.map((employee) => (
                <div
                  key={employee.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{employee.name}</p>
                    <p className="text-xs text-slate-600">{employee.email}</p>
                    <p className="text-xs text-slate-500">Branch: {employee.branch || "Not set"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        employee.is_active
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-600"
                      }
                    >
                      {employee.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      disabled={deletingEmployeeId === employee.id}
                      onClick={() => void handleDeleteEmployee(employee)}
                    >
                      {deletingEmployeeId === employee.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{technician.name}</p>
                    <p className="text-xs text-slate-600">{technician.email}</p>
                    <p className="text-xs text-slate-500">Branch: {technician.branch || "Not set"}</p>
                    {technician.skillset ? <p className="text-xs text-slate-500">{technician.skillset}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
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
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      disabled={deletingTechnicianId === technician.id}
                      onClick={() => void handleDeleteTechnician(technician)}
                    >
                      {deletingTechnicianId === technician.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
