import { NextRequest, NextResponse } from "next/server"

type ParsedAssetFaultReportInput = {
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
  attachment: {
    name: string
    size: number
    type: string
  } | null
}

function resolveBackendBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BACKEND_URL?.trim()
  if (configured) {
    return configured.replace(/\/+$/g, "")
  }
  return "http://127.0.0.1:8000"
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
  ]

  if (input.employeeName) {
    lines.push(`Reported By: ${input.employeeName}`)
  }
  if (input.employeeEmail) {
    lines.push(`Reporter Email: ${input.employeeEmail}`)
  }
  if (input.attachment) {
    lines.push(
      `Attachment: ${input.attachment.name} (${input.attachment.type || "unknown type"}, ${input.attachment.size} bytes)`
    )
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
    const maybeFile = formData.get("attachment")
    const attachment =
      typeof File !== "undefined" && maybeFile instanceof File
        ? {
            name: maybeFile.name,
            size: maybeFile.size,
            type: maybeFile.type,
          }
        : null

    return {
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
      attachment,
    }
  }

  const jsonBody = (await request.json()) as Record<string, unknown>
  return {
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
    attachment: null,
  }
}

function validateInput(input: ParsedAssetFaultReportInput): string | null {
  const requiredFields: Array<[string, string]> = [
    ["assetCode", input.assetCode],
    ["assetName", input.assetName],
    ["assetType", input.assetType],
    ["location", input.location],
    ["department", input.department],
    ["category", input.category],
    ["title", input.title],
    ["description", input.description],
    ["urgency", input.urgency],
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

  const backendBaseUrl = resolveBackendBaseUrl()
  const backendPayload = {
    title: parsedInput.title,
    description: buildComposedDescription(parsedInput),
    category: parsedInput.category,
    priority: toPriority(parsedInput.urgency),
    location: parsedInput.location,
    department: parsedInput.department,
    asset: `${parsedInput.assetName} (${parsedInput.assetCode})`,
    impact: "Reported from Asset Fault QR flow",
    employee_id: parsedInput.employeeId,
    reporter_reviewed_problem: true,
  }

  try {
    const backendResponse = await fetch(`${backendBaseUrl}/api/tickets`, {
      method: "POST",
      headers: {
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
