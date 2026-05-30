import { readFile } from "node:fs/promises"
import path from "node:path"

import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PUBLIC_URL_ENV_KEYS = [
  "NEXT_PUBLIC_CLOUDFLARE_TUNNEL_URL",
  "CLOUDFLARE_TUNNEL_URL",
  "CLOUDFLARE_PUBLIC_URL",
  "CF_TUNNEL_URL",
  "NEXT_PUBLIC_APP_URL",
  "APP_BASE_URL",
  "FRONTEND_BASE_URL",
]

const CLOUDFLARE_LOG_FILES = [
  "cloudflared.log",
  "cloudflared.out.log",
  "cloudflared.err.log",
  "cloudflare.log",
  "cloudflare-tunnel.log",
  "cloudflare-tunnel.out.log",
  "cloudflare-tunnel.err.log",
]

const CLOUDFLARE_QUICK_TUNNEL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"])

type PublicAppUrlResponse = {
  publicUrl: string | null
  fallbackOrigin: string
  source: "env" | "request" | "cloudflared-log" | null
}

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const candidate = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    return parsed.origin.replace(/\/+$/g, "")
  } catch {
    return null
  }
}

function isLocalOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin)
    return LOCAL_HOSTNAMES.has(parsed.hostname.toLowerCase())
  } catch {
    return true
  }
}

function getConfiguredPublicOrigin(): string | null {
  for (const key of PUBLIC_URL_ENV_KEYS) {
    const origin = normalizeOrigin(process.env[key] ?? "")
    if (origin) {
      return origin
    }
  }

  return null
}

function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host
  const protocol = forwardedProto || request.nextUrl.protocol.replace(/:$/g, "") || "http"

  return normalizeOrigin(`${protocol}://${host}`) ?? request.nextUrl.origin
}

async function findCloudflaredLogOrigin(): Promise<string | null> {
  for (const logFile of CLOUDFLARE_LOG_FILES) {
    try {
      const contents = await readFile(path.join(process.cwd(), logFile), "utf8")
      const matches = contents.match(CLOUDFLARE_QUICK_TUNNEL_PATTERN)
      const latestMatch = matches?.at(-1)
      if (latestMatch) {
        return normalizeOrigin(latestMatch)
      }
    } catch {
      // The tunnel log is optional.
    }
  }

  return null
}

export async function GET(request: NextRequest) {
  const fallbackOrigin = getRequestOrigin(request)
  const configuredOrigin = getConfiguredPublicOrigin()
  if (configuredOrigin) {
    return NextResponse.json({
      publicUrl: configuredOrigin,
      fallbackOrigin,
      source: "env",
    } satisfies PublicAppUrlResponse)
  }

  if (!isLocalOrigin(fallbackOrigin)) {
    return NextResponse.json({
      publicUrl: fallbackOrigin,
      fallbackOrigin,
      source: "request",
    } satisfies PublicAppUrlResponse)
  }

  const cloudflaredLogOrigin = await findCloudflaredLogOrigin()
  if (cloudflaredLogOrigin) {
    return NextResponse.json({
      publicUrl: cloudflaredLogOrigin,
      fallbackOrigin,
      source: "cloudflared-log",
    } satisfies PublicAppUrlResponse)
  }

  return NextResponse.json({
    publicUrl: null,
    fallbackOrigin,
    source: null,
  } satisfies PublicAppUrlResponse)
}
