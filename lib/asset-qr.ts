export type AssetScanTokenPayload = {
  v: 1
  asset_id: number
}

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

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/g, "")
}

export function getQrBaseOrigin(): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configuredOrigin) {
    return normalizeOrigin(configuredOrigin)
  }

  if (typeof window !== "undefined" && window.location.origin) {
    return normalizeOrigin(window.location.origin)
  }

  return "http://127.0.0.1:3000"
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
