import { NextRequest, NextResponse } from "next/server"

import { forwardToBackend } from "../../technician-access/_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "authorization",
  "content-type",
  "x-lec-webhook-secret",
  "x-twilio-signature",
])

function buildForwardHeaders(requestHeaders: Headers): Headers {
  const headers = new Headers()

  requestHeaders.forEach((value, key) => {
    if (FORWARDED_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value)
    }
  })

  if (!headers.has("Accept")) {
    headers.set("Accept", "*/*")
  }

  return headers
}

async function buildForwardInit(request: NextRequest): Promise<RequestInit> {
  const method = request.method.toUpperCase()
  const headers = buildForwardHeaders(request.headers)

  if (method === "GET" || method === "HEAD") {
    return { method, headers }
  }

  return {
    method,
    headers,
    body: await request.arrayBuffer(),
  }
}

async function proxyWhatsappWebhook(request: NextRequest): Promise<Response> {
  const backendPath = `/api/whatsapp/incoming${request.nextUrl.search}`

  try {
    const response = await forwardToBackend(backendPath, await buildForwardInit(request))
    const headers = new Headers(response.headers)
    headers.delete("content-encoding")
    headers.delete("content-length")
    headers.delete("transfer-encoding")

    return new Response(await response.arrayBuffer(), {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach WhatsApp intake service."
    return NextResponse.json({ message }, { status: 503 })
  }
}

export { proxyWhatsappWebhook as GET }
export { proxyWhatsappWebhook as POST }
