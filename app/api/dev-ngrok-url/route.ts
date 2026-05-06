import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type NgrokTunnel = {
  public_url?: unknown
  proto?: unknown
}

type NgrokTunnelsResponse = {
  tunnels?: NgrokTunnel[]
}

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ publicUrl: null })
  }

  try {
    const response = await fetch("http://127.0.0.1:4040/api/tunnels", {
      cache: "no-store",
    })

    if (!response.ok) {
      return NextResponse.json({ publicUrl: null })
    }

    const payload = (await response.json()) as NgrokTunnelsResponse
    const tunnel = payload.tunnels?.find(
      (item) => item.proto === "https" && typeof item.public_url === "string"
    )

    return NextResponse.json({
      publicUrl: typeof tunnel?.public_url === "string" ? tunnel.public_url : null,
    })
  } catch {
    return NextResponse.json({ publicUrl: null })
  }
}
