function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function canAttemptJsonParse(rawText: string, contentType: string): boolean {
  const trimmed = rawText.trim()
  if (!trimmed) {
    return false
  }

  return (
    contentType.includes("application/json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[")
  )
}

function extractMessage(payload: unknown): string | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim()
    return trimmed ? trimmed : null
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const message = extractMessage(item)
      if (message) {
        return message
      }
    }
    return null
  }

  if (!isRecord(payload)) {
    return null
  }

  for (const key of ["message", "detail", "error", "errors", "non_field_errors"]) {
    const message = extractMessage(payload[key])
    if (message) {
      return message
    }
  }

  for (const value of Object.values(payload)) {
    const message = extractMessage(value)
    if (message) {
      return message
    }
  }

  return null
}

export type ParsedHttpResponse = {
  contentType: string
  isHtml: boolean
  isJson: boolean
  message: string | null
  payload: unknown
  rawText: string
}

export async function readHttpResponse(response: Response): Promise<ParsedHttpResponse> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
  const rawText = await response.text()
  const trimmed = rawText.trim()
  const normalizedTrimmed = trimmed.toLowerCase()

  const isHtml =
    contentType.includes("text/html") ||
    normalizedTrimmed.startsWith("<!doctype html") ||
    normalizedTrimmed.startsWith("<html")

  let payload: unknown = rawText
  let isJson = false

  if (canAttemptJsonParse(rawText, contentType)) {
    try {
      payload = JSON.parse(rawText) as unknown
      isJson = true
    } catch {
      payload = rawText
    }
  }

  return {
    contentType,
    isHtml,
    isJson,
    message: extractMessage(payload),
    payload,
    rawText,
  }
}
