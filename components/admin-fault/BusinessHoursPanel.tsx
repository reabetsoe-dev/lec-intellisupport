"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, Clock3, PlaneTakeoff, UsersRound } from "lucide-react"

import {
  getDefaultBusinessHours,
  getTechnicians,
  updateDefaultBusinessHours,
  type BusinessDayKey,
  type BusinessHoliday,
  type BusinessHoursConfig,
  type BusinessHoursSchedule,
  type BusinessLeave,
  type Technician,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type SettingsTab = "business-hours" | "holidays" | "groups" | "leave"

type EditableHoliday = {
  localId: string
  id?: number
  name: string
  date: string
}

type EditableLeave = {
  localId: string
  id?: number
  technician_id: number | ""
  leave_type: string
  start_date: string
  end_date: string
}

type BusinessHoursForm = {
  timezone: string
  groups: string[]
  schedule: BusinessHoursSchedule
  holidays: EditableHoliday[]
  leaves: EditableLeave[]
}

const dayOrder: BusinessDayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]

const dayLabel: Record<BusinessDayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
}

const FIXED_TIMEZONE = "Africa/Maseru"
const fallbackLeaveTypeOptions = [
  { value: "annual", label: "Annual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "study", label: "Study Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
  { value: "other", label: "Other" },
]

function createLocalId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createEmptyLeave(): EditableLeave {
  return {
    localId: createLocalId(),
    technician_id: "",
    leave_type: "",
    start_date: "",
    end_date: "",
  }
}

function toEditableHolidays(holidays: BusinessHoliday[]): EditableHoliday[] {
  return holidays.map((holiday) => ({
    localId: createLocalId(),
    id: holiday.id,
    name: holiday.name,
    date: holiday.date,
  }))
}

function toEditableLeaves(leaves: BusinessLeave[]): EditableLeave[] {
  return leaves.map((leave) => ({
    localId: createLocalId(),
    id: leave.id,
    technician_id: leave.technician_id,
    leave_type: leave.leave_type,
    start_date: leave.start_date,
    end_date: leave.end_date,
  }))
}

function toForm(config: BusinessHoursConfig): BusinessHoursForm {
  return {
    timezone: FIXED_TIMEZONE,
    groups: config.groups,
    schedule: config.schedule,
    holidays: toEditableHolidays(config.holidays),
    leaves: config.leaves.length > 0 ? toEditableLeaves(config.leaves) : [createEmptyLeave()],
  }
}

export function BusinessHoursPanel() {
  const [config, setConfig] = useState<BusinessHoursConfig | null>(null)
  const [form, setForm] = useState<BusinessHoursForm | null>(null)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [activeTab, setActiveTab] = useState<SettingsTab>("business-hours")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [hoursPayload, technicianPayload] = await Promise.all([
          getDefaultBusinessHours(),
          getTechnicians(),
        ])
        setConfig(hoursPayload)
        setForm(toForm(hoursPayload))
        setTechnicians(technicianPayload)
        setError("")
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load business hours settings.")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const summary = useMemo(() => {
    if (!form) {
      return "No business hours configured."
    }
    const activeDays = dayOrder.filter((day) => form.schedule[day].enabled)
    if (activeDays.length === 0) {
      return "Closed on all days."
    }
    const firstDay = dayLabel[activeDays[0]]
    const lastDay = dayLabel[activeDays[activeDays.length - 1]]
    const firstWindow = form.schedule[activeDays[0]]
    return `${firstDay} to ${lastDay} - ${firstWindow.start} to ${firstWindow.end}`
  }, [form])

  const leaveTypeOptions = useMemo(
    () => (config?.leave_type_options && config.leave_type_options.length > 0 ? config.leave_type_options : fallbackLeaveTypeOptions),
    [config?.leave_type_options]
  )

  const onScheduleChange = (day: BusinessDayKey, field: "start" | "end" | "enabled", value: string | boolean) => {
    setForm((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        schedule: {
          ...current.schedule,
          [day]: {
            ...current.schedule[day],
            [field]: value,
          },
        },
      }
    })
  }

  const addHoliday = () => {
    setForm((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        holidays: [
          ...current.holidays,
          {
            localId: createLocalId(),
            name: "",
            date: "",
          },
        ],
      }
    })
  }

  const updateHoliday = (localId: string, field: "name" | "date", value: string) => {
    setForm((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        holidays: current.holidays.map((holiday) =>
          holiday.localId === localId ? { ...holiday, [field]: value } : holiday
        ),
      }
    })
  }

  const removeHoliday = (localId: string) => {
    setForm((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        holidays: current.holidays.filter((holiday) => holiday.localId !== localId),
      }
    })
  }

  const addLeave = () => {
    setForm((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        leaves: [...current.leaves, createEmptyLeave()],
      }
    })
  }

  const updateLeave = (
    localId: string,
    field: "technician_id" | "leave_type" | "start_date" | "end_date",
    value: string
  ) => {
    setForm((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        leaves: current.leaves.map((leave) => {
          if (leave.localId !== localId) {
            return leave
          }
          if (field === "technician_id") {
            return {
              ...leave,
              technician_id: value ? Number(value) : "",
            }
          }
          return {
            ...leave,
            [field]: value,
          }
        }),
      }
    })
  }

  const removeLeave = (localId: string) => {
    setForm((current) => {
      if (!current) {
        return current
      }
      const remainingLeaves = current.leaves.filter((leave) => leave.localId !== localId)
      return {
        ...current,
        leaves: remainingLeaves.length > 0 ? remainingLeaves : [createEmptyLeave()],
      }
    })
  }

  const toggleGroup = (groupValue: string, checked: boolean) => {
    setForm((current) => {
      if (!current) {
        return current
      }

      if (groupValue === "all") {
        return {
          ...current,
          groups: checked ? ["all"] : [],
        }
      }

      const withoutAll = current.groups.filter((value) => value !== "all")
      const nextGroups = checked
        ? [...withoutAll, groupValue]
        : withoutAll.filter((value) => value !== groupValue)

      return {
        ...current,
        groups: nextGroups.length > 0 ? nextGroups : ["all"],
      }
    })
  }

  const resetForm = () => {
    if (!config) {
      return
    }
    setForm(toForm(config))
    setError("")
    setMessage("")
  }

  const saveChanges = async () => {
    if (!form) {
      return
    }
    if (!config) {
      setError("Business hours are unavailable.")
      return
    }

    const normalizedGroups = form.groups.length > 0 ? form.groups : ["all"]
    const normalizedHolidays = form.holidays.map((holiday) => ({
      id: holiday.id,
      name: holiday.name.trim(),
      date: holiday.date.trim(),
    }))
    const incompleteHoliday = normalizedHolidays.find((holiday) => !holiday.name || !holiday.date)
    if (incompleteHoliday) {
      setError("Each holiday row must include both a name and date.")
      return
    }

    const normalizedLeaves = form.leaves
      .map((leave) => ({
        id: leave.id,
        technician_id: leave.technician_id,
        leave_type: leave.leave_type.trim(),
        start_date: leave.start_date.trim(),
        end_date: leave.end_date.trim(),
      }))
      .filter(
        (leave) =>
          !(
            leave.id === undefined &&
            leave.technician_id === "" &&
            !leave.leave_type &&
            !leave.start_date &&
            !leave.end_date
          )
      )
    const incompleteLeave = normalizedLeaves.find(
      (leave) =>
        typeof leave.technician_id !== "number" ||
        !leave.leave_type ||
        !leave.start_date ||
        !leave.end_date
    )
    if (incompleteLeave) {
      setError("Each leave row must include person, leave type, start date, and end date.")
      return
    }
    const invalidRange = normalizedLeaves.find((leave) => leave.start_date > leave.end_date)
    if (invalidRange) {
      setError("Leave start date cannot be after end date.")
      return
    }

    try {
      setSaving(true)
      const payload = await updateDefaultBusinessHours({
        name: config.name || "Default Business Hours",
        description: config.description,
        timezone: FIXED_TIMEZONE,
        groups: normalizedGroups,
        schedule: form.schedule,
        holidays: normalizedHolidays,
        leaves: normalizedLeaves as Array<{
          id?: number
          technician_id: number
          leave_type: string
          start_date: string
          end_date: string
        }>,
      })
      setConfig(payload)
      setForm(toForm(payload))
      setError("")
      setMessage("Business hours and leave settings updated successfully.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save business hours settings.")
      setMessage("")
    } finally {
      setSaving(false)
    }
  }

  if (loading && !form) {
    return <p className="text-sm text-slate-500">Loading business hours...</p>
  }

  if (!form || !config) {
    return <p className="text-sm text-rose-600">{error || "Business hours are unavailable."}</p>
  }

  return (
    <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-[#0072CE]/15 px-6 py-5">
        <CardTitle className="text-base font-semibold text-[#0B1F3A]">Business Hours Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 px-6 py-6">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#D6E5F4]">
          <button
            type="button"
            onClick={() => setActiveTab("business-hours")}
            className={`border-b-2 px-1 py-2 text-sm font-medium ${
              activeTab === "business-hours" ? "border-[#0072CE] text-[#0B1F3A]" : "border-transparent text-[#4A6A96]"
            }`}
          >
            Business Hours
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("holidays")}
            className={`border-b-2 px-1 py-2 text-sm font-medium ${
              activeTab === "holidays" ? "border-[#0072CE] text-[#0B1F3A]" : "border-transparent text-[#4A6A96]"
            }`}
          >
            Holidays
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("groups")}
            className={`border-b-2 px-1 py-2 text-sm font-medium ${
              activeTab === "groups" ? "border-[#0072CE] text-[#0B1F3A]" : "border-transparent text-[#4A6A96]"
            }`}
          >
            Groups
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("leave")}
            className={`border-b-2 px-1 py-2 text-sm font-medium ${
              activeTab === "leave" ? "border-[#0072CE] text-[#0B1F3A]" : "border-transparent text-[#4A6A96]"
            }`}
          >
            Leave
          </button>
        </div>

        {activeTab === "business-hours" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#CCE0F5] bg-[#F7FBFF] px-4 py-3 text-sm text-[#1E3A6D]">
              <div className="flex items-center gap-2 font-semibold text-[#0B1F3A]">
                <Clock3 className="h-4 w-4" />
                <span>Default Schedule</span>
              </div>
              <p className="mt-1 text-xs text-[#4A6A96]">{summary}</p>
            </div>
            <div className="space-y-2">
              {dayOrder.map((day) => (
                <div
                  key={day}
                  className="grid grid-cols-1 items-center gap-3 rounded-lg border border-[#D7E7F7] bg-white px-3 py-3 md:grid-cols-[170px_110px_1fr_1fr]"
                >
                  <span className="text-sm font-medium text-[#0B1F3A]">{dayLabel[day]}</span>
                  <label className="inline-flex items-center gap-2 text-xs text-[#1E3A6D]">
                    <input
                      type="checkbox"
                      checked={form.schedule[day].enabled}
                      onChange={(event) => onScheduleChange(day, "enabled", event.target.checked)}
                    />
                    Active
                  </label>
                  <Input
                    type="time"
                    value={form.schedule[day].start}
                    disabled={!form.schedule[day].enabled}
                    onChange={(event) => onScheduleChange(day, "start", event.target.value)}
                  />
                  <Input
                    type="time"
                    value={form.schedule[day].end}
                    disabled={!form.schedule[day].enabled}
                    onChange={(event) => onScheduleChange(day, "end", event.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === "holidays" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#4A6A96]">Define dates where support desk should be treated as closed.</p>
              <Button type="button" variant="outline" className="border-slate-200" onClick={addHoliday}>
                <CalendarDays className="h-4 w-4" />
                Add Holiday
              </Button>
            </div>
            {form.holidays.length === 0 ? (
              <p className="text-sm text-[#4A6A96]">No holidays configured.</p>
            ) : (
              <div className="space-y-2">
                {form.holidays.map((holiday) => (
                  <div
                    key={holiday.localId}
                    className="grid grid-cols-1 gap-3 rounded-lg border border-[#D7E7F7] bg-white px-3 py-3 md:grid-cols-[1fr_180px_auto]"
                  >
                    <Input
                      value={holiday.name}
                      placeholder="Holiday name"
                      onChange={(event) => updateHoliday(holiday.localId, "name", event.target.value)}
                    />
                    <Input
                      type="date"
                      value={holiday.date}
                      onChange={(event) => updateHoliday(holiday.localId, "date", event.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      onClick={() => removeHoliday(holiday.localId)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "groups" ? (
          <div className="space-y-3">
            <p className="text-sm text-[#4A6A96]">Choose technician groups that should follow this business-hour schedule.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {config.group_options.map((option) => {
                const checked = form.groups.includes(option.value)
                return (
                  <label
                    key={option.value}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#D7E7F7] bg-white px-3 py-2 text-sm text-[#0B1F3A]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => toggleGroup(option.value, event.target.checked)}
                    />
                    <UsersRound className="h-4 w-4 text-[#4A6A96]" />
                    {option.label}
                  </label>
                )
              })}
            </div>
          </div>
        ) : null}

        {activeTab === "leave" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#4A6A96]">Track technician leave windows so auto-routing skips unavailable people.</p>
              <Button type="button" variant="outline" className="border-slate-200" onClick={addLeave} disabled={technicians.length === 0}>
                <PlaneTakeoff className="h-4 w-4" />
                Add Leave
              </Button>
            </div>
            {technicians.length === 0 ? (
              <p className="text-sm text-[#4A6A96]">No technicians found. Add technicians before creating leave records.</p>
            ) : null}
            {form.leaves.length === 0 ? (
              <p className="text-sm text-[#4A6A96]">No leave entries configured.</p>
            ) : (
              <div className="space-y-2">
                {form.leaves.map((leave) => (
                  <div
                    key={leave.localId}
                    className="grid grid-cols-1 gap-3 rounded-lg border border-[#D7E7F7] bg-white px-3 py-3 lg:grid-cols-[1fr_220px_180px_180px_auto]"
                  >
                    <select
                      className="h-10 w-full rounded-md border border-[#0072CE]/30 bg-white px-3 text-sm text-[#0B1F3A]"
                      value={leave.technician_id === "" ? "" : String(leave.technician_id)}
                      onChange={(event) => updateLeave(leave.localId, "technician_id", event.target.value)}
                    >
                      <option value="">Select Person</option>
                      {technicians.map((technician) => (
                        <option key={technician.id} value={technician.id}>
                          {technician.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-10 w-full rounded-md border border-[#0072CE]/30 bg-white px-3 text-sm text-[#0B1F3A]"
                      value={leave.leave_type}
                      onChange={(event) => updateLeave(leave.localId, "leave_type", event.target.value)}
                    >
                      <option value="">Select Leave Type</option>
                      {leaveTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      type={leave.start_date ? "date" : "text"}
                      placeholder="Start date"
                      value={leave.start_date}
                      onFocus={(event) => {
                        event.currentTarget.type = "date"
                      }}
                      onBlur={(event) => {
                        if (!event.currentTarget.value) {
                          event.currentTarget.type = "text"
                        }
                      }}
                      onChange={(event) => updateLeave(leave.localId, "start_date", event.target.value)}
                    />
                    <Input
                      type={leave.end_date ? "date" : "text"}
                      placeholder="End date"
                      value={leave.end_date}
                      onFocus={(event) => {
                        event.currentTarget.type = "date"
                      }}
                      onBlur={(event) => {
                        if (!event.currentTarget.value) {
                          event.currentTarget.type = "text"
                        }
                      }}
                      onChange={(event) => updateLeave(leave.localId, "end_date", event.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      onClick={() => removeLeave(leave.localId)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => void saveChanges()}
            disabled={saving}
            className="bg-[#0072CE] text-white hover:bg-[#005EA8]"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          <Button type="button" variant="outline" className="border-slate-200" disabled={saving} onClick={resetForm}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
