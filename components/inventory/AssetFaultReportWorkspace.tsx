"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  CircleCheckBig,
  ClipboardList,
  Loader2,
  QrCode,
  ShieldCheck,
  Wrench,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getConsumables, submitAssetQrFaultReport } from "@/lib/api"
import {
  enrichAssetWithMockMetadata,
  findMockAssetByCode,
  inferTroubleshootingDomain,
  normalizeAssetCode,
  toAssetQrReportAsset,
  type AssetQrReportAsset,
} from "@/lib/assetQrAssets"
import { getFaultCategoryOptions, getTroubleshootingSteps } from "@/lib/assetQrKnowledgeBase"
import { getStoredUserSession, type AuthUser } from "@/lib/auth"

type AssetFaultReportWorkspaceProps = {
  assetCode: string
}

type ReportUrgency = "Low" | "Medium" | "High" | "Critical"

type StepState = "todo" | "active" | "done"

type ReportFormState = {
  category: string
  title: string
  description: string
  urgency: ReportUrgency
  confirmAsset: boolean
  attachment: File | null
}

const URGENCY_OPTIONS: ReportUrgency[] = ["Low", "Medium", "High", "Critical"]

const initialFormState: ReportFormState = {
  category: "",
  title: "",
  description: "",
  urgency: "Medium",
  confirmAsset: false,
  attachment: null,
}

function formatDateOrFallback(value: string | null): string {
  if (!value) {
    return "Not available"
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleDateString()
}

function stepStyles(state: StepState): string {
  if (state === "done") {
    return "border-emerald-300 bg-emerald-50 text-emerald-800"
  }
  if (state === "active") {
    return "border-[#7FB3E3] bg-[#EAF5FF] text-[#0F3C66]"
  }
  return "border-[#C8DBEE] bg-white text-[#5E7FA5]"
}

function locationFromAsset(asset: AssetQrReportAsset): string {
  return asset.location || `${asset.branch} - ${asset.department}`
}

export function AssetFaultReportWorkspace({ assetCode }: AssetFaultReportWorkspaceProps) {
  const [session, setSession] = useState<AuthUser | null>(null)
  const [loadingAsset, setLoadingAsset] = useState(true)
  const [assetError, setAssetError] = useState("")
  const [asset, setAsset] = useState<AssetQrReportAsset | null>(null)
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({})
  const [showReportForm, setShowReportForm] = useState(false)
  const [form, setForm] = useState<ReportFormState>(initialFormState)
  const [submitError, setSubmitError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submissionResult, setSubmissionResult] = useState<{
    ticketId: number
    referenceNumber: string
    message: string
    routingNote?: string
  } | null>(null)

  const normalizedAssetCode = useMemo(() => normalizeAssetCode(assetCode), [assetCode])

  useEffect(() => {
    setSession(getStoredUserSession())
  }, [])

  useEffect(() => {
    let active = true

    const resolveAsset = async () => {
      try {
        setLoadingAsset(true)
        setAssetError("")

        const consumables = await getConsumables()
        if (!active) {
          return
        }

        const matchedConsumable = consumables.find((item) => {
          const currentCode = normalizeAssetCode(item.asset_tag || `AST-${item.id}`)
          return currentCode === normalizedAssetCode
        })

        if (matchedConsumable) {
          const resolvedAsset = enrichAssetWithMockMetadata(toAssetQrReportAsset(matchedConsumable))
          setAsset(resolvedAsset)
          return
        }

        const mockAsset = findMockAssetByCode(normalizedAssetCode)
        if (mockAsset) {
          setAsset(mockAsset)
          return
        }

        setAssetError("Asset not found for this QR code.")
      } catch (error) {
        const mockAsset = findMockAssetByCode(normalizedAssetCode)
        if (mockAsset) {
          setAsset(mockAsset)
          return
        }
        setAssetError(error instanceof Error ? error.message : "Failed to load asset details.")
      } finally {
        if (active) {
          setLoadingAsset(false)
        }
      }
    }

    void resolveAsset()
    return () => {
      active = false
    }
  }, [normalizedAssetCode])

  const troubleshootingDomain = useMemo(
    () => inferTroubleshootingDomain(asset?.assetType || ""),
    [asset?.assetType]
  )
  const troubleshootingSteps = useMemo(
    () => getTroubleshootingSteps(troubleshootingDomain),
    [troubleshootingDomain]
  )
  const categoryOptions = useMemo(
    () => getFaultCategoryOptions(troubleshootingDomain),
    [troubleshootingDomain]
  )

  useEffect(() => {
    if (!categoryOptions.length) {
      return
    }
    setForm((current) => {
      if (current.category) {
        return current
      }
      return { ...current, category: categoryOptions[0] || "Other" }
    })
  }, [categoryOptions])

  const totalSteps = troubleshootingSteps.length
  const completedSteps = troubleshootingSteps.filter((step) => checkedSteps[step.id]).length
  const allTroubleshootingStepsChecked = totalSteps > 0 && completedSteps === totalSteps

  const step1State: StepState = "done"
  const step2State: StepState = showReportForm ? "done" : "active"
  const step3State: StepState = submissionResult ? "done" : showReportForm ? "active" : "todo"

  const canSubmit = Boolean(
    asset &&
      session &&
      session.role === "employee" &&
      form.confirmAsset &&
      form.category.trim() &&
      form.title.trim() &&
      form.description.trim()
  )

  const toggleTroubleshootingStep = (stepId: string) => {
    setCheckedSteps((current) => ({ ...current, [stepId]: !current[stepId] }))
  }

  const submitFaultReport = async () => {
    if (!asset) {
      setSubmitError("Asset details are missing.")
      return
    }

    if (!session || session.role !== "employee") {
      setSubmitError("Please sign in as an employee before submitting an asset fault report.")
      return
    }

    if (!form.confirmAsset) {
      setSubmitError("Please confirm the asset details before submitting.")
      return
    }

    if (!form.category.trim() || !form.title.trim() || !form.description.trim()) {
      setSubmitError("Category, title, and description are required.")
      return
    }

    try {
      setSubmitting(true)
      setSubmitError("")

      const response = await submitAssetQrFaultReport({
        assetCode: asset.assetCode,
        assetName: asset.assetName,
        assetType: asset.assetType,
        location: locationFromAsset(asset),
        department: asset.department,
        category: form.category.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        urgency: form.urgency,
        employeeId: session.id,
        employeeName: session.name,
        employeeEmail: session.login_identifier || "",
        attachment: form.attachment,
      })

      setSubmissionResult({
        ticketId: response.ticketId,
        referenceNumber: response.referenceNumber,
        message: response.message,
        routingNote: response.routingNote,
      })
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to submit fault report.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#F6FAFF_0%,_#EAF2FF_48%,_#E3EEFF_100%)] px-4 py-5 md:px-6 md:py-7">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <Card className="overflow-hidden rounded-2xl border-[#94BFE5] bg-gradient-to-r from-[#0A2F57] via-[#0E4679] to-[#1E5D97] py-0 text-white shadow-[0_24px_52px_-32px_rgba(8,35,67,0.92)]">
          <CardHeader className="space-y-4 px-5 py-5 md:px-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-[24px] leading-tight font-semibold md:text-[30px]">LEC Asset Fault Reporting</CardTitle>
                <p className="mt-1 text-sm text-[#CFE8FF] md:text-base">Scan, troubleshoot, and submit a fault report for this specific asset.</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#D9EEFF]">
                <QrCode className="h-3.5 w-3.5" />
                QR Flow 2
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
              <article className={`rounded-xl border px-3 py-3 ${stepStyles(step1State)}`}>
                <p className="text-xs font-semibold tracking-[0.12em] uppercase">Step 1</p>
                <p className="mt-1 text-sm font-semibold">Scan Asset</p>
              </article>
              <article className={`rounded-xl border px-3 py-3 ${stepStyles(step2State)}`}>
                <p className="text-xs font-semibold tracking-[0.12em] uppercase">Step 2</p>
                <p className="mt-1 text-sm font-semibold">Try Troubleshooting</p>
              </article>
              <article className={`rounded-xl border px-3 py-3 ${stepStyles(step3State)}`}>
                <p className="text-xs font-semibold tracking-[0.12em] uppercase">Step 3</p>
                <p className="mt-1 text-sm font-semibold">Report Fault</p>
              </article>
            </div>
          </CardHeader>
        </Card>

        <Card className="rounded-2xl border-[#B4D2EC] bg-white/90 py-0 shadow-sm">
          <CardHeader className="px-5 py-4 md:px-6">
            <CardTitle className="flex items-center gap-2 text-[20px] font-semibold text-[#0A2E54]">
              <ShieldCheck className="h-5 w-5 text-[#0E5EA2]" />
              Asset Information
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 md:px-6 md:pb-6">
            {loadingAsset ? (
              <div className="flex items-center gap-2 rounded-xl border border-[#BCD6ED] bg-[#F7FBFF] px-4 py-3 text-sm text-[#29567F]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading asset details...
              </div>
            ) : assetError ? (
              <div className="rounded-xl border border-[#EDB7B7] bg-[#FFF5F5] px-4 py-3 text-sm text-[#A83A3A]">
                {assetError}
              </div>
            ) : !asset ? (
              <div className="rounded-xl border border-[#EDB7B7] bg-[#FFF5F5] px-4 py-3 text-sm text-[#A83A3A]">
                Asset not found for code: {normalizedAssetCode}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <article className="rounded-xl border border-[#C8DCF0] bg-[#F9FCFF] px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.12em] text-[#5C7FA2] uppercase">Asset Name</p>
                  <p className="mt-1 text-sm font-semibold text-[#163D63]">{asset.assetName}</p>
                </article>
                <article className="rounded-xl border border-[#C8DCF0] bg-[#F9FCFF] px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.12em] text-[#5C7FA2] uppercase">Asset Code</p>
                  <p className="mt-1 text-sm font-semibold text-[#163D63]">{asset.assetCode}</p>
                </article>
                <article className="rounded-xl border border-[#C8DCF0] bg-[#F9FCFF] px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.12em] text-[#5C7FA2] uppercase">Asset Type</p>
                  <p className="mt-1 text-sm font-semibold text-[#163D63]">{asset.assetType}</p>
                </article>
                <article className="rounded-xl border border-[#C8DCF0] bg-[#F9FCFF] px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.12em] text-[#5C7FA2] uppercase">Branch / Location</p>
                  <p className="mt-1 text-sm font-semibold text-[#163D63]">{locationFromAsset(asset)}</p>
                </article>
                <article className="rounded-xl border border-[#C8DCF0] bg-[#F9FCFF] px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.12em] text-[#5C7FA2] uppercase">Department</p>
                  <p className="mt-1 text-sm font-semibold text-[#163D63]">{asset.department}</p>
                </article>
                <article className="rounded-xl border border-[#C8DCF0] bg-[#F9FCFF] px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.12em] text-[#5C7FA2] uppercase">Current Status</p>
                  <p className="mt-1 text-sm font-semibold text-[#163D63]">{asset.status}</p>
                </article>
                <article className="rounded-xl border border-[#C8DCF0] bg-[#F9FCFF] px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.12em] text-[#5C7FA2] uppercase">Last Maintenance Date</p>
                  <p className="mt-1 text-sm font-semibold text-[#163D63]">{formatDateOrFallback(asset.lastMaintenanceDate)}</p>
                </article>
                <article className="rounded-xl border border-[#C8DCF0] bg-[#F9FCFF] px-4 py-3 sm:col-span-2 xl:col-span-2">
                  <p className="text-xs font-semibold tracking-[0.12em] text-[#5C7FA2] uppercase">Responsible Technician</p>
                  <p className="mt-1 text-sm font-semibold text-[#163D63]">{asset.responsibleTechnician || "Not assigned"}</p>
                </article>
              </div>
            )}
          </CardContent>
        </Card>

        {asset ? (
          <Card className="rounded-2xl border-[#B4D2EC] bg-white/90 py-0 shadow-sm">
            <CardHeader className="px-5 py-4 md:px-6">
              <CardTitle className="flex items-center gap-2 text-[20px] font-semibold text-[#0A2E54]">
                <Wrench className="h-5 w-5 text-[#0E5EA2]" />
                Troubleshooting Checklist
              </CardTitle>
              <p className="text-sm text-[#56789B]">
                Complete these checks first. If the issue still persists, submit a fault report below.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5 md:px-6 md:pb-6">
              <div className="rounded-xl border border-[#C8DCF0] bg-[#F8FBFF] px-4 py-3 text-sm text-[#264E74]">
                Completed {completedSteps} of {totalSteps} checks.
              </div>

              <div className="space-y-2">
                {troubleshootingSteps.map((step) => {
                  const checked = Boolean(checkedSteps[step.id])
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => toggleTroubleshootingStep(step.id)}
                      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
                        checked
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-[#C8DCF0] bg-white text-[#22496F] hover:bg-[#F7FBFF]"
                      }`}
                    >
                      <span className="mt-[2px]">
                        {checked ? <CircleCheckBig className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                      </span>
                      <span className="text-sm font-medium">{step.text}</span>
                    </button>
                  )
                })}
              </div>

              {!showReportForm ? (
                <div className="space-y-3">
                  <Button
                    type="button"
                    onClick={() => setShowReportForm(true)}
                    className="h-11 w-full bg-[#C21E2D] text-white shadow-[0_16px_32px_-22px_rgba(194,30,45,0.85)] hover:bg-[#A81927] md:w-auto"
                  >
                    Still not solved? Report this fault
                  </Button>
                  {allTroubleshootingStepsChecked ? (
                    <p className="text-xs text-[#55789D]">
                      You completed all checklist items. You can still report if the issue remains unresolved.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {asset && showReportForm ? (
          <Card className="rounded-2xl border-[#B4D2EC] bg-white/95 py-0 shadow-sm transition-all duration-300">
            <CardHeader className="px-5 py-4 md:px-6">
              <CardTitle className="flex items-center gap-2 text-[20px] font-semibold text-[#0A2E54]">
                <ClipboardList className="h-5 w-5 text-[#0E5EA2]" />
                Asset Fault Report Form
              </CardTitle>
              <p className="text-sm text-[#56789B]">
                Provide fault details and submit. Ticket will be linked to this asset automatically.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5 md:px-6 md:pb-6">
              {session?.role !== "employee" ? (
                <div className="rounded-xl border border-[#F0C28B] bg-[#FFF9F0] px-4 py-3 text-sm text-[#8B5A19]">
                  Please sign in with an employee account to submit this fault report.
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fault-category" className="text-[#10385E]">
                    Problem category
                  </Label>
                  <select
                    id="fault-category"
                    value={form.category}
                    onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                    className="h-10 w-full rounded-md border border-[#9FC3E7] bg-white px-3 text-sm text-[#12385E] focus:outline-none focus:ring-2 focus:ring-[#2F78BE]/35"
                  >
                    {categoryOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fault-urgency" className="text-[#10385E]">
                    Urgency level
                  </Label>
                  <select
                    id="fault-urgency"
                    value={form.urgency}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, urgency: event.target.value as ReportUrgency }))
                    }
                    className="h-10 w-full rounded-md border border-[#9FC3E7] bg-white px-3 text-sm text-[#12385E] focus:outline-none focus:ring-2 focus:ring-[#2F78BE]/35"
                  >
                    {URGENCY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fault-title" className="text-[#10385E]">
                  Problem title
                </Label>
                <Input
                  id="fault-title"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Example: Printer not printing from finance workstation"
                  className="border-[#9FC3E7]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fault-description" className="text-[#10385E]">
                  Description
                </Label>
                <textarea
                  id="fault-description"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Describe what happens, error messages, and what has already been tried."
                  className="min-h-28 w-full rounded-md border border-[#9FC3E7] bg-white px-3 py-2 text-sm text-[#12385E] focus:outline-none focus:ring-2 focus:ring-[#2F78BE]/35"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fault-attachment" className="text-[#10385E]">
                  Optional image/file upload
                </Label>
                <Input
                  id="fault-attachment"
                  type="file"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      attachment: event.target.files?.[0] ?? null,
                    }))
                  }
                  className="border-[#9FC3E7]"
                />
                {form.attachment ? (
                  <p className="text-xs text-[#54779A]">Selected file: {form.attachment.name}</p>
                ) : null}
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-[#C8DCF0] bg-[#F8FBFF] px-3 py-3">
                <input
                  type="checkbox"
                  checked={form.confirmAsset}
                  onChange={(event) => setForm((current) => ({ ...current, confirmAsset: event.target.checked }))}
                  className="mt-1 h-4 w-4"
                />
                <span className="text-sm text-[#244A6E]">
                  I confirm these fault details belong to asset <span className="font-semibold">{asset.assetCode}</span> ({asset.assetName}).
                </span>
              </label>

              {submitError ? (
                <div className="flex items-start gap-2 rounded-xl border border-[#EDB7B7] bg-[#FFF5F5] px-4 py-3 text-sm text-[#A83A3A]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              ) : null}

              {submissionResult ? (
                <div className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-4">
                  <div className="flex items-start gap-2 text-emerald-800">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{submissionResult.message}</p>
                      <p className="mt-1 text-sm">Ticket Reference: {submissionResult.referenceNumber}</p>
                    </div>
                  </div>
                  {submissionResult.routingNote ? (
                    <p className="text-xs text-emerald-800/90">{submissionResult.routingNote}</p>
                  ) : null}
                  <Button asChild className="h-10 bg-[#0E5EA2] text-white hover:bg-[#0A4E87]">
                    <Link href="/employee/tickets">View My Tickets</Link>
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  disabled={!canSubmit || submitting}
                  onClick={() => void submitFaultReport()}
                  className="h-11 bg-[#0E5EA2] text-white shadow-[0_16px_30px_-20px_rgba(14,94,162,0.9)] hover:bg-[#0A4E87]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Asset Fault Report"
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
