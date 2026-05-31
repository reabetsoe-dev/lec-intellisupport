"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  CheckCircle2,
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
import {
  createTroubleshootingResolution,
  getAssetQrFlow,
  getConsumables,
  submitAssetQrFaultReport,
  type AssetQrCommonProblem,
  type AssetQrFlowAsset,
  type AssetQrTroubleshootingStep,
} from "@/lib/api"
import {
  enrichAssetWithMockMetadata,
  findMockAssetByCode,
  inferTroubleshootingDomain,
  normalizeAssetCode,
  toAssetQrReportAsset,
  type AssetQrReportAsset,
} from "@/lib/assetQrAssets"
import { getCommonProblems, getFaultCategoryOptions } from "@/lib/assetQrKnowledgeBase"
import { getStoredUserSession, type AuthUser } from "@/lib/auth"

type AssetFaultReportWorkspaceProps = {
  assetCode: string
}

type ReportUrgency = "Low" | "Medium" | "High" | "Critical"
type FlowStep = "select_problem" | "troubleshoot" | "report"
type ReportMode = "failed" | "skipped"
type StepState = "todo" | "active" | "done"

type UiStep = {
  id: string
  step_number: number
  instruction: string
}

type UiProblem = {
  id: string
  backendId?: number
  title: string
  description: string
  category: string
  steps: UiStep[]
}

type CompletedTroubleshootingStep = {
  step_id: string
  step_number: number
  instruction: string
}

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

function fromBackendAsset(asset: AssetQrFlowAsset): AssetQrReportAsset {
  return {
    id: asset.id,
    assetCode: normalizeAssetCode(asset.asset_code),
    assetName: asset.asset_name,
    assetType: asset.asset_type,
    location: asset.location,
    branch: asset.branch,
    department: asset.department,
    status: asset.status,
    lastMaintenanceDate: asset.last_maintenance_date,
    responsibleTechnician: asset.responsible_technician,
    source: "backend",
  }
}

function normalizeStep(step: AssetQrTroubleshootingStep): UiStep {
  return {
    id: String(step.id),
    step_number: step.step_number,
    instruction: step.instruction,
  }
}

function fromBackendProblem(problem: AssetQrCommonProblem, fallbackCategory: string): UiProblem {
  const backendId = typeof problem.id === "number" ? problem.id : undefined
  return {
    id: String(problem.id),
    backendId,
    title: problem.title,
    description: problem.description,
    category: problem.category || problem.asset_category || problem.asset_type || fallbackCategory,
    steps: problem.steps.map(normalizeStep),
  }
}

function buildCompletedSteps(problem: UiProblem | null): CompletedTroubleshootingStep[] {
  if (!problem) {
    return []
  }
  return problem.steps
    .map((step) => ({
      step_id: step.id,
      step_number: step.step_number,
      instruction: step.instruction,
    }))
}

export function AssetFaultReportWorkspace({ assetCode }: AssetFaultReportWorkspaceProps) {
  const [session, setSession] = useState<AuthUser | null>(null)
  const [loadingAsset, setLoadingAsset] = useState(true)
  const [assetError, setAssetError] = useState("")
  const [asset, setAsset] = useState<AssetQrReportAsset | null>(null)
  const [commonProblems, setCommonProblems] = useState<UiProblem[]>([])
  const [selectedProblem, setSelectedProblem] = useState<UiProblem | null>(null)
  const [flowStep, setFlowStep] = useState<FlowStep>("select_problem")
  const [reportMode, setReportMode] = useState<ReportMode>("skipped")
  const [form, setForm] = useState<ReportFormState>(initialFormState)
  const [actionError, setActionError] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [recordingResolution, setRecordingResolution] = useState(false)
  const [failedResolutionRecorded, setFailedResolutionRecorded] = useState(false)
  const [skippedResolutionRecorded, setSkippedResolutionRecorded] = useState(false)
  const [solvedResult, setSolvedResult] = useState<{ message: string } | null>(null)
  const [submissionResult, setSubmissionResult] = useState<{
    ticketId: number
    referenceNumber: string
    message: string
    routingNote?: string
  } | null>(null)
  const troubleshootingPanelRef = useRef<HTMLElement | null>(null)
  const reportPanelRef = useRef<HTMLDivElement | null>(null)

  const normalizedAssetCode = useMemo(() => normalizeAssetCode(assetCode), [assetCode])
  const scannedAssetId = useMemo(() => {
    const matched = /^AST-(\d+)$/.exec(normalizedAssetCode)
    return matched ? Number.parseInt(matched[1], 10) : null
  }, [normalizedAssetCode])

  useEffect(() => {
    setSession(getStoredUserSession())
  }, [])

  useEffect(() => {
    let active = true

    const resolveAsset = async () => {
      try {
        setLoadingAsset(true)
        setAssetError("")
        setCommonProblems([])

        const backendFlow = await getAssetQrFlow(normalizedAssetCode)
        if (!active) {
          return
        }

        const resolvedAsset = fromBackendAsset(backendFlow.asset)
        const domain = inferTroubleshootingDomain(resolvedAsset.assetType)
        const fallbackCategory = getFaultCategoryOptions(domain)[0] || "Other"
        const backendProblems = backendFlow.common_problems.map((problem) =>
          fromBackendProblem(problem, fallbackCategory)
        )
        const fallbackProblems = getCommonProblems(domain)

        setAsset(resolvedAsset)
        setCommonProblems(backendProblems.length > 0 ? backendProblems : fallbackProblems)
        setForm((current) => ({ ...current, category: fallbackCategory }))
      } catch (backendError) {
        try {
          const consumables = await getConsumables()
          if (!active) {
            return
          }

          const matchedConsumable = consumables.find((item) => {
            const currentCode = normalizeAssetCode(item.asset_tag || `AST-${item.id}`)
            return currentCode === normalizedAssetCode || (scannedAssetId !== null && item.id === scannedAssetId)
          })

          const resolvedAsset = matchedConsumable
            ? enrichAssetWithMockMetadata(toAssetQrReportAsset(matchedConsumable))
            : findMockAssetByCode(normalizedAssetCode)

          if (!resolvedAsset) {
            setAssetError("Asset not found for this QR code.")
            return
          }

          const domain = inferTroubleshootingDomain(resolvedAsset.assetType)
          setAsset(resolvedAsset)
          setCommonProblems(getCommonProblems(domain))
          setForm((current) => ({ ...current, category: getFaultCategoryOptions(domain)[0] || "Other" }))
        } catch {
          const mockAsset = findMockAssetByCode(normalizedAssetCode)
          if (mockAsset) {
            const domain = inferTroubleshootingDomain(mockAsset.assetType)
            setAsset(mockAsset)
            setCommonProblems(getCommonProblems(domain))
            setForm((current) => ({ ...current, category: getFaultCategoryOptions(domain)[0] || "Other" }))
            return
          }
          setAssetError(backendError instanceof Error ? backendError.message : "Failed to load asset details.")
        }
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
  }, [normalizedAssetCode, scannedAssetId])

  const troubleshootingDomain = useMemo(
    () => inferTroubleshootingDomain(asset?.assetType || ""),
    [asset?.assetType]
  )
  const categoryOptions = useMemo(
    () => getFaultCategoryOptions(troubleshootingDomain),
    [troubleshootingDomain]
  )
  const completedSteps = useMemo(
    () => buildCompletedSteps(selectedProblem),
    [selectedProblem]
  )

  const totalSteps = selectedProblem?.steps.length ?? 0
  const troubleshootingAssetLabel = asset?.assetType || asset?.assetName || "this asset"

  const step1State: StepState = selectedProblem || flowStep !== "select_problem" ? "done" : "active"
  const step2State: StepState =
    flowStep === "troubleshoot" ? "active" : flowStep === "report" || solvedResult ? "done" : "todo"
  const step3State: StepState = solvedResult || submissionResult ? "done" : flowStep === "report" ? "active" : "todo"

  const canSubmit = Boolean(
    asset &&
      session &&
      session.role === "employee" &&
      form.confirmAsset &&
      form.category.trim() &&
      form.title.trim() &&
      form.description.trim()
  )

  useEffect(() => {
    if (!selectedProblem || flowStep !== "troubleshoot") {
      return
    }
    const frameId = window.requestAnimationFrame(() => {
      troubleshootingPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [flowStep, selectedProblem])

  useEffect(() => {
    if (flowStep !== "report") {
      return
    }
    const frameId = window.requestAnimationFrame(() => {
      reportPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [flowStep])

  const resetReportState = () => {
    setSubmissionResult(null)
    setSubmitError("")
    setSkippedResolutionRecorded(false)
    setFailedResolutionRecorded(false)
  }

  const selectProblem = (problem: UiProblem) => {
    setSelectedProblem(problem)
    setSolvedResult(null)
    setActionError("")
    resetReportState()
    setFlowStep("troubleshoot")
    setReportMode("failed")
    setForm({
      ...initialFormState,
      category: problem.category || categoryOptions[0] || "Other",
      title: problem.title,
      description: `${problem.description}\n\nThe guided troubleshooting steps will be attempted before reporting if needed.`,
    })
  }

  const ensureEmployeeSession = (): boolean => {
    if (!session || session.role !== "employee") {
      setActionError("Please sign in as an employee before recording troubleshooting or submitting a fault report.")
      return false
    }
    return true
  }

  const recordResolution = async (status: "solved" | "failed" | "skipped") => {
    if (!asset) {
      throw new Error("Asset details are missing.")
    }
    if (!ensureEmployeeSession()) {
      throw new Error("Employee login is required.")
    }

    const problemTitle =
      status === "skipped"
        ? "Manual report without troubleshooting"
        : selectedProblem?.title || "Asset troubleshooting"

    return createTroubleshootingResolution({
      asset_id: asset.id,
      asset_code: asset.assetCode,
      problem_id: selectedProblem?.backendId,
      problem_title: problemTitle,
      completed_steps: completedSteps,
      resolution_status: status,
      solved_by: "system_guided_troubleshooting",
      solved_by_display: "LEC IntelliSupport Guided Troubleshooting",
      source: status === "skipped" ? "qr_asset_manual_report" : "qr_asset_troubleshooting",
      branch: locationFromAsset(asset),
      department: asset.department,
    })
  }

  const markSolved = async () => {
    setActionError("")
    if (!selectedProblem) {
      setActionError("Select a common problem before recording this as solved.")
      return
    }
    try {
      setRecordingResolution(true)
      const response = await recordResolution("solved")
      setSolvedResult({ message: response.message })
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to record the solved troubleshooting result.")
    } finally {
      setRecordingResolution(false)
    }
  }

  const openFailedReport = async () => {
    setActionError("")
    setSubmitError("")
    setReportMode("failed")
    setFlowStep("report")
    if (selectedProblem) {
      setForm((current) => ({
        ...current,
        category: selectedProblem.category || current.category || categoryOptions[0] || "Other",
        title: selectedProblem.title,
        description: `${selectedProblem.description}\n\nTroubleshooting result: not solved after guided steps.\nGuided steps shown: ${
          completedSteps.length > 0
            ? completedSteps.map((step) => `${step.step_number}. ${step.instruction}`).join(" ")
            : "No guided steps were available."
        }`,
      }))
    }

    if (session?.role === "employee" && !failedResolutionRecorded) {
      try {
        setRecordingResolution(true)
        await recordResolution("failed")
        setFailedResolutionRecorded(true)
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : "Troubleshooting attempt could not be recorded.")
      } finally {
        setRecordingResolution(false)
      }
    }
  }

  const openManualReport = () => {
    if (!asset) {
      return
    }
    setActionError("")
    setSubmitError("")
    setSelectedProblem(null)
    setSolvedResult(null)
    resetReportState()
    setReportMode("skipped")
    setFlowStep("report")
    setForm({
      ...initialFormState,
      category: categoryOptions[0] || "Other",
      title: `Fault with ${asset.assetName}`,
      description: "Troubleshooting was skipped. Please describe the issue affecting this asset.",
    })
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

      if (reportMode === "skipped" && !skippedResolutionRecorded) {
        await recordResolution("skipped")
        setSkippedResolutionRecorded(true)
      }
      if (reportMode === "failed" && session.role === "employee" && !failedResolutionRecorded) {
        await recordResolution("failed")
        setFailedResolutionRecorded(true)
      }

      const response = await submitAssetQrFaultReport({
        assetId: asset.id,
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
        troubleshootingAttempted: reportMode === "failed",
        troubleshootingProblem: selectedProblem?.title || "",
        troubleshootingStepsCompleted: completedSteps,
        troubleshootingResult: reportMode,
        source: reportMode === "failed" ? "qr_asset_troubleshooting" : "qr_asset_manual_report",
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
                QR Flow
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
              <article className={`rounded-xl border px-3 py-3 ${stepStyles(step1State)}`}>
                <p className="text-xs font-semibold tracking-[0.12em] uppercase">Step 1</p>
                <p className="mt-1 text-sm font-semibold">Select Problem</p>
              </article>
              <article className={`rounded-xl border px-3 py-3 ${stepStyles(step2State)}`}>
                <p className="text-xs font-semibold tracking-[0.12em] uppercase">Step 2</p>
                <p className="mt-1 text-sm font-semibold">Troubleshoot</p>
              </article>
              <article className={`rounded-xl border px-3 py-3 ${stepStyles(step3State)}`}>
                <p className="text-xs font-semibold tracking-[0.12em] uppercase">Step 3</p>
                <p className="mt-1 text-sm font-semibold">Solved or Report Fault</p>
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
                  <p className="mt-1 text-sm font-semibold text-[#163D63]">{asset.department || "N/A"}</p>
                </article>
                <article className="rounded-xl border border-[#C8DCF0] bg-[#F9FCFF] px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.12em] text-[#5C7FA2] uppercase">Current Status</p>
                  <p className="mt-1 text-sm font-semibold text-[#163D63]">{asset.status || "N/A"}</p>
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
                Common problems for {troubleshootingAssetLabel}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5 md:px-6 md:pb-6">
              {commonProblems.length === 0 ? (
                <div className="rounded-xl border border-[#F0C28B] bg-[#FFF9F0] px-4 py-3 text-sm text-[#8B5A19]">
                  No common problems are configured for this asset yet.
                </div>
              ) : selectedProblem && flowStep === "troubleshoot" ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
                  <section className="order-2 space-y-3 lg:order-1">
                    <div>
                      <h2 className="text-sm font-semibold text-[#0A2E54]">Common issues</h2>
                      <p className="mt-1 text-sm text-[#55789D]">Select a different issue if the current one does not match.</p>
                    </div>
                    <div className="space-y-2">
                      {commonProblems.map((problem) => {
                        const isSelected = selectedProblem.id === problem.id
                        return (
                          <button
                            key={problem.id}
                            type="button"
                            onClick={() => selectProblem(problem)}
                            className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                              isSelected
                                ? "border-[#0E5EA2] bg-[#F1F8FF]"
                                : "border-[#C8DCF0] bg-white hover:bg-[#F7FBFF]"
                            }`}
                          >
                            <span className="block text-sm font-semibold text-[#0A2E54]">{problem.title}</span>
                            <span className="mt-1 block text-sm text-[#55789D]">{problem.description}</span>
                            <span
                              className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                isSelected ? "bg-[#0E5EA2] text-white" : "bg-[#EAF4FF] text-[#0E5EA2]"
                              }`}
                            >
                              {isSelected ? "Selected" : "Troubleshoot"}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full border-[#C21E2D]/30 bg-white text-[#A81927] hover:bg-[#FFF4F5]"
                      onClick={openManualReport}
                    >
                      Report a different issue manually
                    </Button>
                  </section>

                  <section
                    ref={troubleshootingPanelRef}
                    id="qr-troubleshooting-guidance"
                    className="order-1 rounded-xl border border-[#9FC3E7] bg-[#F8FBFF] px-4 py-4 lg:order-2"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold tracking-[0.12em] text-[#0E5EA2] uppercase">
                          Troubleshooting steps for {troubleshootingAssetLabel}
                        </p>
                        <h2 className="mt-1 text-lg font-semibold text-[#0A2E54]">{selectedProblem.title}</h2>
                        <p className="mt-1 text-sm text-[#55789D]">
                          {asset.assetName} ({asset.assetCode})
                        </p>
                      </div>
                      <span className="inline-flex w-fit rounded-full border border-[#B4D2EC] bg-white px-3 py-1 text-xs font-semibold text-[#315E89]">
                        {totalSteps} {totalSteps === 1 ? "step" : "steps"}
                      </span>
                    </div>

                    <ol className="mt-4 space-y-2">
                      {selectedProblem.steps.map((step) => (
                        <li
                          key={step.id}
                          className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-xl border border-[#C8DCF0] bg-white px-3 py-3 text-[#22496F]"
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EAF4FF] text-sm font-semibold text-[#0E5EA2]">
                            {step.step_number}
                          </span>
                          <p className="self-center text-sm font-medium">{step.instruction}</p>
                        </li>
                      ))}
                    </ol>

                    {actionError ? (
                      <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#EDB7B7] bg-[#FFF5F5] px-4 py-3 text-sm text-[#A83A3A]">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{actionError}</span>
                      </div>
                    ) : null}

                    {solvedResult ? (
                      <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{solvedResult.message}</span>
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-col gap-3 md:flex-row md:flex-wrap">
                      <Button
                        type="button"
                        disabled={recordingResolution || Boolean(solvedResult)}
                        onClick={() => void markSolved()}
                        className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        {recordingResolution ? "Recording..." : solvedResult ? "Solved recorded" : "Problem is solved"}
                      </Button>
                      <Button
                        type="button"
                        disabled={recordingResolution}
                        onClick={() => void openFailedReport()}
                        className="h-11 bg-[#C21E2D] text-white hover:bg-[#A81927]"
                      >
                        Report fault manually
                      </Button>
                    </div>
                  </section>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {commonProblems.map((problem) => (
                      <article
                        key={problem.id}
                        className="rounded-xl border border-[#C8DCF0] bg-white px-4 py-4 transition"
                      >
                        <h2 className="text-base font-semibold text-[#0A2E54]">{problem.title}</h2>
                        <p className="mt-1 text-sm text-[#55789D]">{problem.description}</p>
                        <Button
                          type="button"
                          className="mt-4 h-10 w-full bg-[#0E5EA2] text-white hover:bg-[#0A4E87]"
                          onClick={() => selectProblem(problem)}
                        >
                          Troubleshoot this problem
                        </Button>
                      </article>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full border-[#C21E2D]/30 bg-white text-[#A81927] hover:bg-[#FFF4F5] md:w-auto"
                    onClick={openManualReport}
                  >
                    Report manually without troubleshooting
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        {asset && flowStep === "report" ? (
          <div ref={reportPanelRef}>
          <Card className="rounded-2xl border-[#B4D2EC] bg-white/95 py-0 shadow-sm transition-all duration-300">
            <CardHeader className="px-5 py-4 md:px-6">
              <CardTitle className="flex items-center gap-2 text-[20px] font-semibold text-[#0A2E54]">
                <ClipboardList className="h-5 w-5 text-[#0E5EA2]" />
                Asset Fault Report Form
              </CardTitle>
              <p className="text-sm text-[#56789B]">
                Ticket source: {reportMode === "failed" ? "QR troubleshooting failed" : "Manual QR report"}.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5 md:px-6 md:pb-6">
              {session?.role !== "employee" ? (
                <div className="rounded-xl border border-[#F0C28B] bg-[#FFF9F0] px-4 py-3 text-sm text-[#8B5A19]">
                  Please sign in with an employee account to submit this fault report.
                </div>
              ) : null}

              {reportMode === "failed" && selectedProblem ? (
                <div className="rounded-xl border border-[#C8DCF0] bg-[#F8FBFF] px-4 py-3 text-sm text-[#264E74]">
                  <p className="font-semibold">Selected problem: {selectedProblem.title}</p>
                  <p className="mt-1">
                    Guided troubleshooting steps were shown for {asset.assetName}: {totalSteps} {totalSteps === 1 ? "step" : "steps"}.
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fault-category" className="text-[#10385E]">Problem category</Label>
                  <select
                    id="fault-category"
                    value={form.category}
                    onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                    className="h-10 w-full rounded-md border border-[#9FC3E7] bg-white px-3 text-sm text-[#12385E] focus:outline-none focus:ring-2 focus:ring-[#2F78BE]/35"
                  >
                    {categoryOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fault-urgency" className="text-[#10385E]">Urgency level</Label>
                  <select
                    id="fault-urgency"
                    value={form.urgency}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, urgency: event.target.value as ReportUrgency }))
                    }
                    className="h-10 w-full rounded-md border border-[#9FC3E7] bg-white px-3 text-sm text-[#12385E] focus:outline-none focus:ring-2 focus:ring-[#2F78BE]/35"
                  >
                    {URGENCY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fault-title" className="text-[#10385E]">Problem title</Label>
                <Input
                  id="fault-title"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Example: Printer not printing from finance workstation"
                  className="border-[#9FC3E7]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fault-description" className="text-[#10385E]">Description</Label>
                <textarea
                  id="fault-description"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Describe what happens, error messages, and what has already been tried."
                  className="min-h-32 w-full rounded-md border border-[#9FC3E7] bg-white px-3 py-2 text-sm text-[#12385E] focus:outline-none focus:ring-2 focus:ring-[#2F78BE]/35"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fault-attachment" className="text-[#10385E]">Optional image/file upload</Label>
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
                {form.attachment ? <p className="text-xs text-[#54779A]">Selected file: {form.attachment.name}</p> : null}
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
                  {submissionResult.routingNote ? <p className="text-xs text-emerald-800/90">{submissionResult.routingNote}</p> : null}
                  <Button asChild className="h-10 bg-[#0E5EA2] text-white hover:bg-[#0A4E87]">
                    <Link href="/employee/tickets">View My Tickets</Link>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
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
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 border-[#C21E2D]/30 bg-white text-[#A81927] hover:bg-[#FFF4F5]"
                    onClick={openManualReport}
                  >
                    Report manually without troubleshooting
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          </div>
        ) : null}
      </div>
    </div>
  )
}
