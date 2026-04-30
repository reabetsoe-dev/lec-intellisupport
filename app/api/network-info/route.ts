import { networkInterfaces } from "node:os"

import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type NetworkCandidate = {
  interfaceName: string
  address: string
  score: number
}

const WIFI_INTERFACE_PATTERN = /(wi-?fi|wireless|wlan)/i
const WIRED_INTERFACE_PATTERN = /(ethernet|^eth\d*$|^en\d*$|lan)/i
const DEPRIORITIZED_INTERFACE_PATTERN =
  /(vmware|virtual|vbox|hyper-v|vethernet|loopback|docker|wsl|tailscale|zerotier|hamachi|bluetooth)/i

function isPrivateIpv4Address(address: string): boolean {
  if (address.startsWith("10.")) {
    return true
  }

  if (address.startsWith("192.168.")) {
    return true
  }

  const parts = address.split(".").map((segment) => Number.parseInt(segment, 10))
  return parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31
}

function scoreInterface(interfaceName: string, address: string): number {
  let score = 0

  if (WIFI_INTERFACE_PATTERN.test(interfaceName)) {
    score += 100
  } else if (WIRED_INTERFACE_PATTERN.test(interfaceName)) {
    score += 50
  }

  if (DEPRIORITIZED_INTERFACE_PATTERN.test(interfaceName)) {
    score -= 100
  }

  if (isPrivateIpv4Address(address)) {
    score += 10
  }

  return score
}

function getNetworkCandidates(): NetworkCandidate[] {
  const interfaces = networkInterfaces()
  const candidates: NetworkCandidate[] = []

  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue
      }

      if (entry.address.startsWith("127.") || entry.address.startsWith("169.254.")) {
        continue
      }

      candidates.push({
        interfaceName,
        address: entry.address,
        score: scoreInterface(interfaceName, entry.address),
      })
    }
  }

  return candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    return left.interfaceName.localeCompare(right.interfaceName)
  })
}

export async function GET() {
  const candidates = getNetworkCandidates()

  return NextResponse.json({
    primaryAddress: candidates[0]?.address ?? null,
    candidates: candidates.map(({ interfaceName, address }) => ({
      interfaceName,
      address,
    })),
  })
}
