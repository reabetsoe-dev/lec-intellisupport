import { NextRequest, NextResponse } from "next/server"

import { forwardToBackend, toProxyJsonResponse } from "../../technician-access/_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = {
  params: Promise<{
    path: string[]
  }>
}

const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "authorization",
  "content-type",
])

function buildForwardHeaders(requestHeaders: Headers): Headers {
  const headers = new Headers()

  requestHeaders.forEach((value, key) => {
    if (!FORWARDED_REQUEST_HEADERS.has(key.toLowerCase())) {
      return
    }

    headers.set(key, value)
  })

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json")
  }

  return headers
}

async function buildForwardInit(request: NextRequest): Promise<RequestInit> {
  const method = request.method.toUpperCase()
  const headers = buildForwardHeaders(request.headers)

  if (method === "GET" || method === "HEAD") {
    return {
      method,
      headers,
    }
  }

  return {
    method,
    headers,
    body: await request.arrayBuffer(),
  }
}

async function proxyBackendRequest(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params

  if (!Array.isArray(path) || path.length === 0) {
    return NextResponse.json({ message: "Backend API path is required." }, { status: 400 })
  }

  const normalizedSegments = path[0] === "api" ? path : ["api", ...path]
  const backendPath = `/${normalizedSegments.join("/")}${request.nextUrl.search}`

  try {
    const response = await forwardToBackend(backendPath, await buildForwardInit(request))
    return await toProxyJsonResponse(response, "Unable to complete the backend request.")
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach backend service."
    return NextResponse.json({ message }, { status: 503 })
  }
}

export { proxyBackendRequest as GET }
export { proxyBackendRequest as POST }
export { proxyBackendRequest as PUT }
export { proxyBackendRequest as PATCH }
export { proxyBackendRequest as DELETE }
export { proxyBackendRequest as HEAD }
