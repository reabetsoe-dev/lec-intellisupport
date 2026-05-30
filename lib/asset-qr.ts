export type AssetScanTokenPayload = {
  v: 1
  asset_id: number
}

export const QR_PUBLIC_ORIGIN_STORAGE_KEY = "lec_asset_qr_public_origin"

const QR_PUBLIC_ORIGIN_QUERY_PARAMS = ["qrOrigin", "cloudflareUrl", "publicUrl"]
const LOCAL_QR_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"])

function toBase64Url(value: string): string {
  if (typeof window === "undefined") {
    return Buffer.from(value, "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "")
  }

  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function fromBase64Url(value: string): string | null {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const paddingLength = (4 - (normalized.length % 4)) % 4
  const padded = `${normalized}${"=".repeat(paddingLength)}`

  try {
    if (typeof window === "undefined") {
      return Buffer.from(padded, "base64").toString("utf-8")
    }

    const binary = window.atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

export function buildAssetScanToken(assetId: number): string {
  const payload: AssetScanTokenPayload = {
    v: 1,
    asset_id: assetId,
  }
  return toBase64Url(JSON.stringify(payload))
}

export function parseAssetScanToken(token: string): AssetScanTokenPayload | null {
  const raw = fromBase64Url(token.trim())
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AssetScanTokenPayload>
    if (parsed.v !== 1 || typeof parsed.asset_id !== "number" || !Number.isInteger(parsed.asset_id) || parsed.asset_id <= 0) {
      return null
    }
    return { v: 1, asset_id: parsed.asset_id }
  } catch {
    return null
  }
}

export function buildAssetScanPath(token: string): string {
  return `/asset-scan/${encodeURIComponent(token)}`
}

export function buildAssetFaultReportPath(assetCode: string): string {
  return `/asset-qr/report/${encodeURIComponent(assetCode.trim())}`
}

export function normalizeQrOrigin(value: string): string | null {
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

export function isLocalQrOrigin(value: string): boolean {
  try {
    const parsed = new URL(value)
    return LOCAL_QR_HOSTNAMES.has(parsed.hostname.toLowerCase())
  } catch {
    return true
  }
}

function normalizeOrigin(value: string): string {
  return normalizeQrOrigin(value) ?? value.trim().replace(/\/+$/g, "")
}

function getBrowserQrOriginOverride(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const searchParams = new URLSearchParams(window.location.search)
    for (const paramName of QR_PUBLIC_ORIGIN_QUERY_PARAMS) {
      const normalized = normalizeQrOrigin(searchParams.get(paramName) ?? "")
      if (normalized && !isLocalQrOrigin(normalized)) {
        window.localStorage.setItem(QR_PUBLIC_ORIGIN_STORAGE_KEY, normalized)
        return normalized
      }
    }

    const storedOrigin = normalizeQrOrigin(window.localStorage.getItem(QR_PUBLIC_ORIGIN_STORAGE_KEY) ?? "")
    return storedOrigin && !isLocalQrOrigin(storedOrigin) ? storedOrigin : null
  } catch {
    return null
  }
}

export function getQrBaseOrigin(): string {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_CLOUDFLARE_TUNNEL_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configuredOrigin) {
    return normalizeOrigin(configuredOrigin)
  }

  const browserOverride = getBrowserQrOriginOverride()
  if (browserOverride) {
    return browserOverride
  }

  if (typeof window !== "undefined" && window.location.origin) {
    return normalizeOrigin(window.location.origin)
  }

  return "http://127.0.0.1:3000"
}

export async function resolveQrBaseOrigin(): Promise<string> {
  if (typeof window === "undefined") {
    return getQrBaseOrigin()
  }

  const browserOverride = getBrowserQrOriginOverride()
  if (browserOverride) {
    return browserOverride
  }

  try {
    const response = await fetch("/api/public-app-url", { cache: "no-store" })
    if (!response.ok) {
      return getQrBaseOrigin()
    }

    const payload = (await response.json()) as { publicUrl?: unknown; fallbackOrigin?: unknown }
    if (typeof payload.publicUrl === "string" && payload.publicUrl.trim()) {
      return normalizeOrigin(payload.publicUrl)
    }
    if (
      typeof payload.fallbackOrigin === "string" &&
      payload.fallbackOrigin.trim() &&
      !isLocalQrOrigin(payload.fallbackOrigin)
    ) {
      return normalizeOrigin(payload.fallbackOrigin)
    }
  } catch {
    // Fall back to the browser origin when the helper route is unavailable.
  }

  return getQrBaseOrigin()
}

export function getClientOrigin(): string {
  return getQrBaseOrigin()
}

export function buildAssetScanUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/g, "")}${buildAssetScanPath(token)}`
}

export function buildAssetFaultReportUrl(origin: string, assetCode: string): string {
  return `${origin.replace(/\/+$/g, "")}${buildAssetFaultReportPath(assetCode)}`
}
