import { NextResponse } from "next/server"

import { readHttpResponse } from "@/lib/http-response"

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000"

function toIpv4Localhost(baseUrl: string): string {
  return baseUrl.replace("://localhost", "://127.0.0.1")
}

function normalizeBackendBaseUrl(baseUrl: string): string {
  return toIpv4Localhost(baseUrl.replace(/\/$/, ""))
}

function getConfiguredBackendBaseUrl(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    process.env.BACKEND_BASE_URL

  return envUrl ? normalizeBackendBaseUrl(envUrl) : normalizeBackendBaseUrl(DEFAULT_BACKEND_URL)
}

export function resolveBackendBaseUrl(): string {
  return getConfiguredBackendBaseUrl()
}

async function fetchBackendResponse(baseUrl: string, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json")
  }

  return fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    ...init,
    headers,
  })
}

export async function forwardToBackend(path: string, init?: RequestInit): Promise<Response> {
  const configuredBaseUrl = getConfiguredBackendBaseUrl()
  const fallbackBaseUrl = normalizeBackendBaseUrl(DEFAULT_BACKEND_URL)

  try {
    const primaryResponse = await fetchBackendResponse(configuredBaseUrl, path, init)

    if (configuredBaseUrl === fallbackBaseUrl) {
      return primaryResponse
    }

    const { isHtml } = await readHttpResponse(primaryResponse.clone())
    if (!isHtml) {
      return primaryResponse
    }
  } catch {
    if (configuredBaseUrl === fallbackBaseUrl) {
      throw new Error(`Cannot reach backend service at ${configuredBaseUrl}.`)
    }
  }

  try {
    return await fetchBackendResponse(fallbackBaseUrl, path, init)
  } catch {
    throw new Error(`Cannot reach backend service at ${fallbackBaseUrl}.`)
  }
}

export async function toProxyJsonResponse(response: Response, fallbackMessage: string): Promise<Response> {
  const { isHtml, isJson, message, payload, rawText } = await readHttpResponse(response)

  if (response.status === 204 || !rawText.trim()) {
    return new NextResponse(null, { status: response.status })
  }

  if (isJson) {
    return NextResponse.json(payload, { status: response.status })
  }

  const normalizedMessage = isHtml
    ? `${fallbackMessage} The backend returned HTML instead of JSON. Check NEXT_PUBLIC_BACKEND_URL, BACKEND_URL, or BACKEND_BASE_URL.`
    : message ?? fallbackMessage

  return NextResponse.json(
    {
      message: normalizedMessage,
    },
    {
      status: response.ok ? 502 : response.status,
    }
  )
}
