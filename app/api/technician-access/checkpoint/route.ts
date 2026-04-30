import { NextRequest, NextResponse } from "next/server"

import { forwardToBackend, toProxyJsonResponse } from "../_shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 })
  }

  try {
    const response = await forwardToBackend("/api/auth/technician-checkpoint", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    return await toProxyJsonResponse(response, "Unable to update technician availability.")
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach backend service."
    return NextResponse.json({ message }, { status: 503 })
  }
}
