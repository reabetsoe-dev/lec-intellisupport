import { NextRequest, NextResponse } from "next/server"

import { forwardToBackend } from "../../technician-access/_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ParsedAssetFaultReportInput = {
  assetId: number | null
  assetCode: string
  assetName: string
  assetType: string
  location: string
  department: string
  category: string
  title: string
  description: string
  urgency: string
  employeeId: number | null
  employeeName: string
  employeeEmail: string
  troubleshootingAttempted: boolean
  troubleshootingProblem: string
  troubleshootingStepsCompleted: unknown[]
  troubleshootingResult: "failed" | "skipped" | "not_attempted"
  source: "qr_asset_troubleshooting" | "qr_asset_manual_report" | "manual"
}

function toTrimmedString(value: FormDataEntryValue | unknown): string {
  if (typeof value === "string") {
    return value.trim()
  }
  return ""
}

function toEmployeeId(value: FormDataEntryValue | unknown): number | null {
  const parsed = Number.parseInt(toTrimmedString(value), 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

function toOptionalNumber(value: FormDataEntryValue | unknown): number | null {
  const parsed = Number.parseInt(toTrimmedString(value), 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function toBoolean(value: FormDataEntryValue | unknown): boolean {
  const normalized = toTrimmedString(value).toLowerCase()
  return ["1", "true", "yes", "y"].includes(normalized)
}

function toCompletedSteps(value: FormDataEntryValue | unknown): unknown[] {
  const raw = toTrimmedString(value)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function toTroubleshootingResult(value: FormDataEntryValue | unknown): "failed" | "skipped" | "not_attempted" {
  const normalized = toTrimmedString(value).toLowerCase()
  if (normalized === "failed" || normalized === "skipped") {
    return normalized
  }
  return "not_attempted"
}

function toSource(value: FormDataEntryValue | unknown): "qr_asset_troubleshooting" | "qr_asset_manual_report" | "manual" {
  const normalized = toTrimmedString(value)
  if (normalized === "qr_asset_troubleshooting" || normalized === "qr_asset_manual_report") {
    return normalized
  }
  return "manual"
}

function toPriority(value: string): "Low" | "Medium" | "High" | "Critical" {
  const normalized = value.trim().toLowerCase()
  if (normalized === "low") {
    return "Low"
  }
  if (normalized === "high") {
    return "High"
  }
  if (normalized === "critical") {
    return "Critical"
  }
  return "Medium"
}

function resolveCategory(input: ParsedAssetFaultReportInput): string {
  if (input.category.trim()) {
    return input.category.trim()
  }
  if (input.troubleshootingProblem.trim()) {
    return "Guided Troubleshooting"
  }
  return "Hardware"
}

function buildComposedDescription(input: ParsedAssetFaultReportInput): string {
  const lines = [
    input.description,
    "",
    "Asset Fault Report Metadata:",
    `Asset Code: ${input.assetCode}`,
    `Asset Name: ${input.assetName}`,
    `Asset Type: ${input.assetType}`,
    `Location: ${input.location}`,
    `Department: ${input.department}`,
    `Source: ${input.source}`,
    `Troubleshooting Attempted: ${input.troubleshootingAttempted ? "Yes" : "No"}`,
    `Troubleshooting Result: ${input.troubleshootingResult}`,
  ]

  if (input.troubleshootingProblem) {
    lines.push(`Selected Problem: ${input.troubleshootingProblem}`)
  }
  if (input.troubleshootingStepsCompleted.length > 0) {
    lines.push("Completed Troubleshooting Steps:")
    for (const step of input.troubleshootingStepsCompleted) {
      if (step && typeof step === "object" && "instruction" in step) {
        const record = step as { step_number?: unknown; instruction?: unknown }
        lines.push(`${record.step_number ?? "-"}: ${String(record.instruction ?? "")}`)
      } else {
        lines.push(String(step))
      }
    }
  }

  if (input.employeeName) {
    lines.push(`Reported By: ${input.employeeName}`)
  }
  if (input.employeeEmail) {
    lines.push(`Reporter Email: ${input.employeeEmail}`)
  }

  return lines.join("\n")
}

function buildReferenceNumber(ticketId: number): string {
  return `TKT-${String(ticketId).padStart(5, "0")}`
}

async function parseRequestBody(request: NextRequest): Promise<ParsedAssetFaultReportInput> {
  const contentType = request.headers.get("content-type") ?? ""

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData()

    return {
      assetId: toOptionalNumber(formData.get("assetId")),
      assetCode: toTrimmedString(formData.get("assetCode")),
      assetName: toTrimmedString(formData.get("assetName")),
      assetType: toTrimmedString(formData.get("assetType")),
      location: toTrimmedString(formData.get("location")),
      department: toTrimmedString(formData.get("department")),
      category: toTrimmedString(formData.get("category")),
      title: toTrimmedString(formData.get("title")),
      description: toTrimmedString(formData.get("description")),
      urgency: toTrimmedString(formData.get("urgency")),
      employeeId: toEmployeeId(formData.get("employeeId")),
      employeeName: toTrimmedString(formData.get("employeeName")),
      employeeEmail: toTrimmedString(formData.get("employeeEmail")),
      troubleshootingAttempted: toBoolean(formData.get("troubleshootingAttempted")),
      troubleshootingProblem: toTrimmedString(formData.get("troubleshootingProblem")),
      troubleshootingStepsCompleted: toCompletedSteps(formData.get("troubleshootingStepsCompleted")),
      troubleshootingResult: toTroubleshootingResult(formData.get("troubleshootingResult")),
      source: toSource(formData.get("source")),
    }
  }

  const jsonBody = (await request.json()) as Record<string, unknown>
  return {
    assetId: toOptionalNumber(jsonBody.assetId),
    assetCode: toTrimmedString(jsonBody.assetCode),
    assetName: toTrimmedString(jsonBody.assetName),
    assetType: toTrimmedString(jsonBody.assetType),
    location: toTrimmedString(jsonBody.location),
    department: toTrimmedString(jsonBody.department),
    category: toTrimmedString(jsonBody.category),
    title: toTrimmedString(jsonBody.title),
    description: toTrimmedString(jsonBody.description),
    urgency: toTrimmedString(jsonBody.urgency),
    employeeId: toEmployeeId(jsonBody.employeeId),
    employeeName: toTrimmedString(jsonBody.employeeName),
    employeeEmail: toTrimmedString(jsonBody.employeeEmail),
    troubleshootingAttempted: Boolean(jsonBody.troubleshootingAttempted),
    troubleshootingProblem: toTrimmedString(jsonBody.troubleshootingProblem),
    troubleshootingStepsCompleted: Array.isArray(jsonBody.troubleshootingStepsCompleted)
      ? jsonBody.troubleshootingStepsCompleted
      : [],
    troubleshootingResult: toTroubleshootingResult(jsonBody.troubleshootingResult),
    source: toSource(jsonBody.source),
  }
}

function validateInput(input: ParsedAssetFaultReportInput): string | null {
  const requiredFields: Array<[string, string]> = [
    ["assetCode", input.assetCode],
    ["assetName", input.assetName],
    ["assetType", input.assetType],
    ["location", input.location],
    ["department", input.department],
    ["title", input.title],
    ["description", input.description],
  ]

  for (const [field, value] of requiredFields) {
    if (!value) {
      return `${field} is required.`
    }
  }

  if (!input.employeeId) {
    return "Employee login is required before submitting an asset fault report."
  }

  return null
}

export async function POST(request: NextRequest) {
  let parsedInput: ParsedAssetFaultReportInput
  try {
    parsedInput = await parseRequestBody(request)
  } catch {
    return NextResponse.json(
      { message: "Invalid request payload. Please retry your submission." },
      { status: 400 }
    )
  }

  const validationMessage = validateInput(parsedInput)
  if (validationMessage) {
    return NextResponse.json({ message: validationMessage }, { status: 400 })
  }

  const backendPayload = {
    title: parsedInput.title,
    description: buildComposedDescription(parsedInput),
    category: resolveCategory(parsedInput),
    priority: toPriority(parsedInput.urgency),
    location: parsedInput.location,
    department: parsedInput.department,
    asset_id: parsedInput.assetId,
    asset_code: parsedInput.assetCode,
    asset: `${parsedInput.assetName} (${parsedInput.assetCode})`,
    impact: "Reported from Asset Fault QR flow",
    employee_id: parsedInput.employeeId,
    reporter_reviewed_problem: true,
    troubleshooting_attempted: parsedInput.troubleshootingAttempted,
    troubleshooting_problem: parsedInput.troubleshootingProblem,
    troubleshooting_steps_completed: parsedInput.troubleshootingStepsCompleted,
    troubleshooting_result: parsedInput.troubleshootingResult,
    source: parsedInput.source,
  }

  try {
    const backendResponse = await forwardToBackend("/api/tickets", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(backendPayload),
      cache: "no-store",
    })

    const responseText = await backendResponse.text()
    let responseData: Record<string, unknown> = {}
    if (responseText) {
      try {
        responseData = JSON.parse(responseText) as Record<string, unknown>
      } catch {
        responseData = {}
      }
    }

    if (!backendResponse.ok) {
      const backendMessage = typeof responseData.message === "string" ? responseData.message : "Failed to create fault ticket."
      return NextResponse.json({ message: backendMessage }, { status: backendResponse.status })
    }

    const ticketId = typeof responseData.id === "number" ? responseData.id : null
    if (!ticketId) {
      return NextResponse.json(
        { message: "Fault report was received but ticket ID is missing in response." },
        { status: 502 }
      )
    }

    return NextResponse.json(
      {
        message:
          "Your asset fault report has been submitted successfully. A technician will be assigned shortly.",
        ticketId,
        referenceNumber: buildReferenceNumber(ticketId),
        routingNote: typeof responseData.routing_note === "string" ? responseData.routing_note : "",
      },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to reach backend ticket service for asset fault submission.",
      },
      { status: 503 }
    )
  }
}
