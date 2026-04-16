"use client"

import { FormEvent, useEffect, useState } from "react"
import { UserRound, UsersRound, Wrench, type LucideIcon } from "lucide-react"

import {
  createEmployee,
  createTechnician,
  deleteEmployee,
  deleteTechnician,
  getEmployees,
  getTechnicians,
  type Employee,
  type Technician,
  updateEmployeeDetails,
  updateEmployeeStatus,
  updateTechnicianDetails,
  updateTechnicianStatus,
} from "@/lib/api"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { BRANCH_OPTIONS } from "@/lib/organization-options"
import {
  getInterfaceActionCardClassName,
  getInterfaceCardDescriptionClassName,
  getInterfaceCardIconClassName,
  getInterfaceCardTitleClassName,
} from "@/lib/interface-card-styles"

const skillsetOptions = [
  "Network",
  "Software",
  "Hardware",
  "Security",
]
const TECHNICIAN_BRANCH = "Maseru HQ"
const TECHNICIAN_DEPARTMENT = "IT"

type ManagementSection = "add-employee" | "add-technician" | "view-users"
type EditableEmployee = {
  id: number
  name: string
  email: string
  branch: string
}
type EditableTechnician = {
  id: number
  name: string
  email: string
  skillset: string
}

export function TechnicianManagementPanel() {
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [skillset, setSkillset] = useState("")
  const [employeeName, setEmployeeName] = useState("")
  const [employeeEmail, setEmployeeEmail] = useState("")
  const [employeeBranch, setEmployeeBranch] = useState("")
  const [saving, setSaving] = useState(false)
  const [savingEmployee, setSavingEmployee] = useState(false)
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<number | null>(null)
  const [deletingTechnicianId, setDeletingTechnicianId] = useState<number | null>(null)
  const [updatingEmployeeId, setUpdatingEmployeeId] = useState<number | null>(null)
  const [updatingTechnicianId, setUpdatingTechnicianId] = useState<number | null>(null)
  const [editingEmployee, setEditingEmployee] = useState<EditableEmployee | null>(null)
  const [savingEditedEmployee, setSavingEditedEmployee] = useState(false)
  const [editingTechnician, setEditingTechnician] = useState<EditableTechnician | null>(null)
  const [savingEditedTechnician, setSavingEditedTechnician] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [activeSection, setActiveSection] = useState<ManagementSection | null>(null)
  const [resultDialog, setResultDialog] = useState<{
    open: boolean
    status: "success" | "error"
    message: string
  }>({
    open: false,
    status: "success",
    message: "",
  })
  const [pendingAction, setPendingAction] = useState<
    | {
        kind: "employee" | "technician"
        action: "activate" | "deactivate" | "delete"
        id: number
        name: string
      }
    | null
  >(null)

  const showResultDialog = (status: "success" | "error", message: string) => {
    setResultDialog({
      open: true,
      status,
      message,
    })
  }

  const loadTechnicians = async () => {
    const data = await getTechnicians()
    setTechnicians(data)
  }

  const loadEmployees = async () => {
    const data = await getEmployees()
    setEmployees(data)
  }

  useEffect(() => {
    Promise.all([loadTechnicians(), loadEmployees()]).catch((loadError) => {
      setLoadError(loadError instanceof Error ? loadError.message : "Failed to load technicians.")
    })
  }, [])

  const handleDeleteEmployee = (employee: Employee) => {
    setPendingAction({ kind: "employee", action: "delete", id: employee.id, name: employee.name })
  }

  const handleDeleteTechnician = (technician: Technician) => {
    setPendingAction({ kind: "technician", action: "delete", id: technician.id, name: technician.name })
  }

  const handleToggleEmployeeStatus = (employee: Employee) => {
    setPendingAction({
      kind: "employee",
      action: employee.is_active ? "deactivate" : "activate",
      id: employee.id,
      name: employee.name,
    })
  }

  const handleToggleTechnicianStatus = (technician: Technician) => {
    setPendingAction({
      kind: "technician",
      action: technician.is_active ? "deactivate" : "activate",
      id: technician.id,
      name: technician.name,
    })
  }

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      branch: employee.branch ?? "",
    })
  }

  const handleEditTechnician = (technician: Technician) => {
    setEditingTechnician({
      id: technician.id,
      name: technician.name,
      email: technician.email,
      skillset: technician.skillset,
    })
  }

  const handleEditEmployeeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingEmployee) return

    const trimmedName = editingEmployee.name.trim()
    const trimmedEmail = editingEmployee.email.trim()
    const trimmedBranch = editingEmployee.branch.trim()

    if (!trimmedName) {
      showResultDialog("error", "Employee name is required.")
      return
    }

    if (!trimmedEmail) {
      showResultDialog("error", "Employee email is required.")
      return
    }

    try {
      setSavingEditedEmployee(true)
      await updateEmployeeDetails(editingEmployee.id, {
        name: trimmedName,
        email: trimmedEmail,
        branch: trimmedBranch,
      })
      await loadEmployees()
      setEditingEmployee(null)
      showResultDialog("success", `Employee ${trimmedName} updated.`)
    } catch (editError) {
      showResultDialog(
        "error",
        editError instanceof Error ? editError.message : "Failed to update employee."
      )
    } finally {
      setSavingEditedEmployee(false)
    }
  }

  const handleEditTechnicianSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingTechnician) return

    const trimmedName = editingTechnician.name.trim()
    const trimmedEmail = editingTechnician.email.trim()
    const trimmedSkillset = editingTechnician.skillset.trim()

    if (!trimmedName) {
      showResultDialog("error", "Technician name is required.")
      return
    }

    if (!trimmedEmail) {
      showResultDialog("error", "Technician email is required.")
      return
    }

    if (!trimmedSkillset) {
      showResultDialog("error", "Technician skill is required.")
      return
    }

    try {
      setSavingEditedTechnician(true)
      await updateTechnicianDetails(editingTechnician.id, {
        name: trimmedName,
        email: trimmedEmail,
        skillset: trimmedSkillset,
      })
      await loadTechnicians()
      setEditingTechnician(null)
      showResultDialog("success", `Technician ${trimmedName} updated.`)
    } catch (editError) {
      showResultDialog(
        "error",
        editError instanceof Error ? editError.message : "Failed to update technician."
      )
    } finally {
      setSavingEditedTechnician(false)
    }
  }

  const confirmPendingAction = async () => {
    if (!pendingAction) return

    const actionLabel =
      pendingAction.action === "activate"
        ? "activated"
        : pendingAction.action === "deactivate"
          ? "deactivated"
          : "deleted"

    try {
      if (pendingAction.kind === "employee") {
        if (pendingAction.action === "delete") {
          setDeletingEmployeeId(pendingAction.id)
          await deleteEmployee(pendingAction.id)
        } else {
          setUpdatingEmployeeId(pendingAction.id)
          await updateEmployeeStatus(pendingAction.id, pendingAction.action === "activate")
        }
        await loadEmployees()
        showResultDialog("success", `Employee ${pendingAction.name} ${actionLabel}.`)
      } else {
        if (pendingAction.action === "delete") {
          setDeletingTechnicianId(pendingAction.id)
          await deleteTechnician(pendingAction.id)
        } else {
          setUpdatingTechnicianId(pendingAction.id)
          await updateTechnicianStatus(pendingAction.id, pendingAction.action === "activate")
        }
        await loadTechnicians()
        showResultDialog("success", `Technician ${pendingAction.name} ${actionLabel}.`)
      }
    } catch (actionError) {
      showResultDialog(
        "error",
        actionError instanceof Error
          ? actionError.message
          : pendingAction.kind === "employee"
            ? pendingAction.action === "delete"
              ? "Failed to delete employee."
              : "Failed to update employee status."
            : pendingAction.action === "delete"
              ? "Failed to delete technician."
              : "Failed to update technician status."
      )
    } finally {
      setPendingAction(null)
      setDeletingEmployeeId(null)
      setDeletingTechnicianId(null)
      setUpdatingEmployeeId(null)
      setUpdatingTechnicianId(null)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!skillset.trim()) {
      showResultDialog("error", "Skill is required when creating a technician.")
      return
    }

    try {
      setSaving(true)
      await createTechnician({
        name: name.trim(),
        email: email.trim(),
        skillset: skillset.trim(),
      })
      setName("")
      setEmail("")
      setSkillset("")
      await loadTechnicians()
      showResultDialog("success", "Technician created. Setup link sent to their email.")
    } catch (submitError) {
      showResultDialog("error", submitError instanceof Error ? submitError.message : "Failed to create technician.")
    } finally {
      setSaving(false)
    }
  }

  const handleEmployeeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      setSavingEmployee(true)
      await createEmployee({
        name: employeeName.trim(),
        email: employeeEmail.trim(),
        branch: employeeBranch,
        is_active: true,
      })
      setEmployeeName("")
      setEmployeeEmail("")
      setEmployeeBranch("")
      await loadEmployees()
      showResultDialog("success", "Employee created. Setup link sent to their email.")
    } catch (submitError) {
      showResultDialog("error", submitError instanceof Error ? submitError.message : "Failed to create employee.")
    } finally {
      setSavingEmployee(false)
    }
  }

  const sectionCards: Array<{
    key: ManagementSection
    title: string
    description: string
    icon: LucideIcon
  }> = [
    {
      key: "add-employee",
      title: "Add Employee",
      description: "Create a new employee account.",
      icon: UserRound,
    },
    {
      key: "add-technician",
      title: "Add Technician",
      description: "Create a technician profile.",
      icon: Wrench,
    },
    {
      key: "view-users",
      title: "View Users",
      description: "See current employees and technicians.",
      icon: UsersRound,
    },
  ]

  return (
    <Card id="technician-management" className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-[#0072CE]/15 px-6 py-5">
        <CardTitle className="text-base font-semibold text-[#0B1F3A]">User & Technician Management</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 px-6 py-6">
        {loadError ? <p className="text-sm text-rose-600">{loadError}</p> : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sectionCards.map((section) => {
            const isActive = activeSection === section.key
            const Icon = section.icon
            return (
              <button
                key={section.key}
                type="button"
                aria-pressed={isActive}
                onClick={() =>
                  setActiveSection((current) => (current === section.key ? null : section.key))
                }
                className={getInterfaceActionCardClassName(isActive)}
              >
                <span className={getInterfaceCardIconClassName(isActive)}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="space-y-1">
                  <span className={getInterfaceCardTitleClassName(isActive)}>
                    {section.title}
                  </span>
                  <span className={getInterfaceCardDescriptionClassName(isActive)}>
                    {section.description}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {activeSection === "add-employee" ? (
          <form
            className="grid grid-cols-1 gap-4 rounded-lg border border-[#0072CE]/20 bg-[#F7FBFF] p-4 md:grid-cols-2"
            onSubmit={handleEmployeeSubmit}
          >
          <p className="md:col-span-2 text-xs text-[#4A6A96]">
            A one-time password setup link will be sent to this email address.
          </p>
          <div className="space-y-2">
            <label htmlFor="employee-name" className="text-sm font-medium text-[#1E3A6D]">
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
            <label htmlFor="employee-email" className="text-sm font-medium text-[#1E3A6D]">
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
            <label htmlFor="employee-branch" className="text-sm font-medium text-[#1E3A6D]">
              Employee Branch
            </label>
            <select
              id="employee-branch"
              className="h-10 w-full rounded-md border border-[#0072CE]/30 bg-white px-3 text-sm text-[#0B1F3A]"
              value={employeeBranch}
              onChange={(event) => setEmployeeBranch(event.target.value)}
              required
            >
              <option value="">Select branch</option>
              {BRANCH_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={savingEmployee} className="bg-[#0072CE] text-white hover:bg-[#005EA8]">
              {savingEmployee ? "Creating..." : "Add Employee"}
            </Button>
          </div>
          </form>
        ) : null}

        {activeSection === "add-technician" ? (
          <form
            className="grid grid-cols-1 gap-4 rounded-lg border border-[#0072CE]/20 bg-[#F7FBFF] p-4 md:grid-cols-2"
            onSubmit={handleSubmit}
          >
          <p className="md:col-span-2 text-xs text-[#4A6A96]">
            A one-time password setup link will be sent to this email address.
          </p>
          <div className="space-y-2">
            <label htmlFor="technician-name" className="text-sm font-medium text-[#1E3A6D]">
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
            <label htmlFor="technician-email" className="text-sm font-medium text-[#1E3A6D]">
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
            <label htmlFor="technician-branch" className="text-sm font-medium text-[#1E3A6D]">
              Branch
            </label>
            <Input
              id="technician-branch"
              value={TECHNICIAN_BRANCH}
              readOnly
              disabled
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="technician-department" className="text-sm font-medium text-[#1E3A6D]">
              Department
            </label>
            <Input
              id="technician-department"
              value={TECHNICIAN_DEPARTMENT}
              readOnly
              disabled
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="technician-skillset" className="text-sm font-medium text-[#1E3A6D]">
              Skill
            </label>
            <select
              id="technician-skillset"
              className="h-10 w-full rounded-md border border-[#0072CE]/30 bg-white px-3 text-sm text-[#0B1F3A]"
              value={skillset}
              onChange={(event) => setSkillset(event.target.value)}
              required
            >
              <option value="">Select skill</option>
              {skillsetOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <Button type="submit" disabled={saving} className="bg-[#0072CE] text-white hover:bg-[#005EA8]">
              {saving ? "Creating..." : "Add Technician"}
            </Button>
          </div>
          </form>
        ) : null}

        {activeSection === "view-users" ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-[#0B1F3A]">Current Employees</p>
              {employees.length === 0 ? (
                <p className="text-sm text-[#4A6A96]">No employees found.</p>
              ) : (
                <div className="space-y-2">
                  {employees.map((employee) => (
                    <div
                      key={employee.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#0072CE]/20 bg-[#F7FBFF] px-3 py-2"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[#0B1F3A]">{employee.name}</p>
                        <p className="text-xs text-[#1E3A6D]">{employee.email}</p>
                        <p className="text-xs text-[#4A6A96]">Branch: {employee.branch || "Not set"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            employee.is_active
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-[#0072CE]/25 bg-white text-[#1E3A6D]"
                          }
                        >
                          {employee.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-[#0072CE]/30 text-[#0B1F3A] hover:bg-[#EAF3FF] hover:text-[#0B1F3A]"
                          disabled={
                            deletingEmployeeId === employee.id ||
                            updatingEmployeeId === employee.id ||
                            savingEditedEmployee
                          }
                          onClick={() => handleEditEmployee(employee)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={
                            employee.is_active
                              ? "border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                          }
                          disabled={deletingEmployeeId === employee.id || updatingEmployeeId === employee.id}
                          onClick={() => handleToggleEmployeeStatus(employee)}
                        >
                          {updatingEmployeeId === employee.id
                            ? employee.is_active
                              ? "Deactivating..."
                              : "Activating..."
                            : employee.is_active
                              ? "Deactivate"
                              : "Activate"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                          disabled={deletingEmployeeId === employee.id || updatingEmployeeId === employee.id}
                          onClick={() => handleDeleteEmployee(employee)}
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
              <p className="text-sm font-semibold text-[#0B1F3A]">Current Technicians</p>
              {technicians.length === 0 ? (
                <p className="text-sm text-[#4A6A96]">No technicians found.</p>
              ) : (
                <div className="mx-auto w-full max-w-5xl space-y-2">
                  {technicians.map((technician) => (
                    <div
                      key={technician.id}
                      className="rounded-lg border border-[#BFD8F3] bg-gradient-to-r from-[#F8FCFF] to-[#EDF6FF] p-3 shadow-[0_4px_12px_rgba(11,31,58,0.05)]"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#0072CE]/30 bg-white text-xs font-semibold text-[#0B4B84]">
                            {technician.name
                              .split(" ")
                              .map((part) => part[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <div className="min-w-0 space-y-1">
                            <p className="truncate text-base font-semibold text-[#0B1F3A]">{technician.name}</p>
                            <p className="truncate text-xs text-[#355A84]">{technician.email}</p>
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              <span className="inline-flex items-center rounded-full border border-[#A8C8E8] bg-white px-2 py-0.5 text-[11px] font-medium text-[#335E8C]">
                                Branch: {technician.branch || "Not set"}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-[#A8C8E8] bg-white px-2 py-0.5 text-[11px] font-medium text-[#335E8C]">
                                Department: {technician.department || TECHNICIAN_DEPARTMENT}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-[#C6DAEE] bg-[#F2F8FF] px-2 py-0.5 text-[11px] font-medium text-[#426A96]">
                                {technician.skillset || "No skillset"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-end gap-2 border-t border-[#D6E5F4] pt-2">
                        <Badge
                          variant="outline"
                          className={
                            technician.is_active
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-[#0072CE]/25 bg-white text-[#1E3A6D]"
                          }
                        >
                          {technician.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 border-[#0072CE]/30 bg-white px-2.5 text-xs text-[#0B1F3A] hover:bg-[#EAF3FF] hover:text-[#0B1F3A]"
                          disabled={
                            deletingTechnicianId === technician.id ||
                            updatingTechnicianId === technician.id ||
                            savingEditedTechnician
                          }
                          onClick={() => handleEditTechnician(technician)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={
                            technician.is_active
                              ? "h-8 border-amber-200 bg-white px-2.5 text-xs text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                              : "h-8 border-emerald-200 bg-white px-2.5 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                          }
                          disabled={deletingTechnicianId === technician.id || updatingTechnicianId === technician.id}
                          onClick={() => handleToggleTechnicianStatus(technician)}
                        >
                          {updatingTechnicianId === technician.id
                            ? technician.is_active
                              ? "Deactivating..."
                              : "Activating..."
                            : technician.is_active
                              ? "Deactivate"
                              : "Activate"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 border-rose-200 bg-white px-2.5 text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                          disabled={deletingTechnicianId === technician.id || updatingTechnicianId === technician.id}
                          onClick={() => handleDeleteTechnician(technician)}
                        >
                          {deletingTechnicianId === technician.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>

      <ActionFeedbackDialog
        open={resultDialog.open}
        status={resultDialog.status}
        message={resultDialog.message}
        onOk={() => setResultDialog((current) => ({ ...current, open: false }))}
      />

      <Dialog open={Boolean(editingEmployee)} onOpenChange={(open) => {
        if (!open && !savingEditedEmployee) {
          setEditingEmployee(null)
        }
      }}>
        <DialogContent className="max-w-lg border-[#0072CE]/25">
          <DialogHeader>
            <DialogTitle className="text-[#0B1F3A]">Edit Employee</DialogTitle>
            <DialogDescription className="text-[#1E3A6D]">
              Update the selected employee&apos;s current details.
            </DialogDescription>
          </DialogHeader>
          {editingEmployee ? (
            <form className="space-y-4" onSubmit={handleEditEmployeeSubmit}>
              <div className="space-y-2">
                <label htmlFor="edit-employee-name" className="text-sm font-medium text-[#1E3A6D]">
                  Employee Name
                </label>
                <Input
                  id="edit-employee-name"
                  value={editingEmployee.name}
                  onChange={(event) =>
                    setEditingEmployee((current) =>
                      current ? { ...current, name: event.target.value } : current
                    )
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-employee-email" className="text-sm font-medium text-[#1E3A6D]">
                  Employee Email
                </label>
                <Input
                  id="edit-employee-email"
                  type="email"
                  value={editingEmployee.email}
                  onChange={(event) =>
                    setEditingEmployee((current) =>
                      current ? { ...current, email: event.target.value } : current
                    )
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-employee-branch" className="text-sm font-medium text-[#1E3A6D]">
                  Employee Branch
                </label>
                <select
                  id="edit-employee-branch"
                  className="h-10 w-full rounded-md border border-[#0072CE]/30 bg-white px-3 text-sm text-[#0B1F3A]"
                  value={editingEmployee.branch}
                  onChange={(event) =>
                    setEditingEmployee((current) =>
                      current ? { ...current, branch: event.target.value } : current
                    )
                  }
                >
                  <option value="">Not set</option>
                  {BRANCH_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#0072CE]/30 text-[#0B1F3A] hover:bg-[#F4FAFF]"
                  disabled={savingEditedEmployee}
                  onClick={() => setEditingEmployee(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#0072CE] text-white hover:bg-[#005DA8]"
                  disabled={savingEditedEmployee}
                >
                  {savingEditedEmployee ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingTechnician)} onOpenChange={(open) => {
        if (!open && !savingEditedTechnician) {
          setEditingTechnician(null)
        }
      }}>
        <DialogContent className="max-w-lg border-[#0072CE]/25">
          <DialogHeader>
            <DialogTitle className="text-[#0B1F3A]">Edit Technician</DialogTitle>
            <DialogDescription className="text-[#1E3A6D]">
              Update the selected technician&apos;s current details.
            </DialogDescription>
          </DialogHeader>
          {editingTechnician ? (
            <form className="space-y-4" onSubmit={handleEditTechnicianSubmit}>
              <div className="space-y-2">
                <label htmlFor="edit-technician-name" className="text-sm font-medium text-[#1E3A6D]">
                  Technician Name
                </label>
                <Input
                  id="edit-technician-name"
                  value={editingTechnician.name}
                  onChange={(event) =>
                    setEditingTechnician((current) =>
                      current ? { ...current, name: event.target.value } : current
                    )
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-technician-email" className="text-sm font-medium text-[#1E3A6D]">
                  Technician Email
                </label>
                <Input
                  id="edit-technician-email"
                  type="email"
                  value={editingTechnician.email}
                  onChange={(event) =>
                    setEditingTechnician((current) =>
                      current ? { ...current, email: event.target.value } : current
                    )
                  }
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="edit-technician-branch" className="text-sm font-medium text-[#1E3A6D]">
                    Branch
                  </label>
                  <Input id="edit-technician-branch" value={TECHNICIAN_BRANCH} readOnly disabled />
                </div>
                <div className="space-y-2">
                  <label htmlFor="edit-technician-department" className="text-sm font-medium text-[#1E3A6D]">
                    Department
                  </label>
                  <Input id="edit-technician-department" value={TECHNICIAN_DEPARTMENT} readOnly disabled />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-technician-skillset" className="text-sm font-medium text-[#1E3A6D]">
                  Skill
                </label>
                <select
                  id="edit-technician-skillset"
                  className="h-10 w-full rounded-md border border-[#0072CE]/30 bg-white px-3 text-sm text-[#0B1F3A]"
                  value={editingTechnician.skillset}
                  onChange={(event) =>
                    setEditingTechnician((current) =>
                      current ? { ...current, skillset: event.target.value } : current
                    )
                  }
                  required
                >
                  <option value="">Select skill</option>
                  {skillsetOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#0072CE]/30 text-[#0B1F3A] hover:bg-[#F4FAFF]"
                  disabled={savingEditedTechnician}
                  onClick={() => setEditingTechnician(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#0072CE] text-white hover:bg-[#005DA8]"
                  disabled={savingEditedTechnician}
                >
                  {savingEditedTechnician ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <ActionConfirmationDialog
        open={Boolean(pendingAction)}
        title={
          pendingAction
            ? `${pendingAction.action.charAt(0).toUpperCase()}${pendingAction.action.slice(1)} ${
                pendingAction.kind === "employee" ? "Employee" : "Technician"
              }`
            : ""
        }
        description={
          pendingAction
            ? pendingAction.action === "delete"
              ? `Delete ${pendingAction.kind} ${pendingAction.name}? This action cannot be undone.`
              : `${pendingAction.action === "activate" ? "Activate" : "Deactivate"} ${
                  pendingAction.kind
                } ${pendingAction.name}?`
            : ""
        }
        confirmLabel={
          pendingAction
            ? `${pendingAction.action.charAt(0).toUpperCase()}${pendingAction.action.slice(1)}`
            : "Confirm"
        }
        confirmVariant={pendingAction?.action === "delete" ? "destructive" : "default"}
        confirmDisabled={
          deletingEmployeeId !== null ||
          deletingTechnicianId !== null ||
          updatingEmployeeId !== null ||
          updatingTechnicianId !== null
        }
        onConfirm={() => void confirmPendingAction()}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null)
          }
        }}
      />
    </Card>
  )
}
