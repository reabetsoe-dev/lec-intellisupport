import { NextResponse } from "next/server"

import { forwardToBackend, toProxyJsonResponse } from "../_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const response = await forwardToBackend("/api/technicians")
    return await toProxyJsonResponse(response, "Unable to load technician availability.")
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach backend service."
    return NextResponse.json({ message }, { status: 503 })
  }
}
