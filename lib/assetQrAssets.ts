import type { Consumable } from "@/lib/api"
import type { AssetTroubleshootingDomain } from "@/lib/assetQrKnowledgeBase"

export type AssetQrReportAsset = {
  id?: number
  assetCode: string
  assetName: string
  assetType: string
  location: string
  branch: string
  department: string
  status: string
  lastMaintenanceDate: string | null
  responsibleTechnician: string | null
  source: "backend" | "mock"
}

const DEFAULT_BRANCH = "Head Office"
const DEFAULT_DEPARTMENT = "General"

const mockAssetCatalog: AssetQrReportAsset[] = [
  {
    assetCode: "PRN-LEC-HQ-001",
    assetName: "HP LaserJet Pro Printer",
    assetType: "Printer",
    branch: "Head Office",
    department: "Finance",
    location: "Head Office - Finance Department",
    status: "Active",
    lastMaintenanceDate: "2026-03-15",
    responsibleTechnician: "Thabo M.",
    source: "mock",
  },
  {
    assetCode: "LTP-LEC-HQ-014",
    assetName: "Dell Latitude 5440",
    assetType: "Laptop",
    branch: "Head Office",
    department: "HR",
    location: "Head Office - HR Department",
    status: "Active",
    lastMaintenanceDate: "2026-02-27",
    responsibleTechnician: "Lerato K.",
    source: "mock",
  },
  {
    assetCode: "RTR-LEC-MAP-002",
    assetName: "Cisco ISR Router",
    assetType: "Router",
    branch: "Maputsoe",
    department: "Operations",
    location: "Maputsoe - Operations",
    status: "Active",
    lastMaintenanceDate: "2026-04-01",
    responsibleTechnician: "Kamohelo P.",
    source: "mock",
  },
]

export function normalizeAssetCode(value: string): string {
  return value.trim().toUpperCase()
}

function looksLikePrinter(value: string): boolean {
  const normalized = value.toLowerCase()
  return ["printer", "laser", "inkjet", "thermal", "toner"].some((token) => normalized.includes(token))
}

function looksLikeComputer(value: string): boolean {
  const normalized = value.toLowerCase()
  return ["laptop", "desktop", "computer", "workstation", "notebook"].some((token) => normalized.includes(token))
}

function looksLikeNetwork(value: string): boolean {
  const normalized = value.toLowerCase()
  return ["router", "switch", "wifi", "network", "lan", "wan", "access point"].some((token) => normalized.includes(token))
}

export function inferTroubleshootingDomain(assetType: string): AssetTroubleshootingDomain {
  if (looksLikePrinter(assetType)) {
    return "printer"
  }
  if (looksLikeComputer(assetType)) {
    return "computer"
  }
  if (looksLikeNetwork(assetType)) {
    return "network"
  }
  return "general"
}

export function buildAssetNameFromConsumable(item: Consumable): string {
  return `${item.brand || ""} ${item.model_number || ""}`.trim() || item.item_name || "Unknown Asset"
}

export function buildAssetTypeFromConsumable(item: Consumable): string {
  return item.subcategory || item.device_type || item.printer_type || item.category || "General Asset"
}

export function toAssetQrReportAsset(item: Consumable): AssetQrReportAsset {
  const branch = DEFAULT_BRANCH
  const department = (item.department || "").trim() || DEFAULT_DEPARTMENT
  const location = `${branch} - ${department}`
  const fallbackCode = `AST-${item.id}`

  return {
    id: item.id,
    assetCode: normalizeAssetCode(item.asset_tag || fallbackCode),
    assetName: buildAssetNameFromConsumable(item),
    assetType: buildAssetTypeFromConsumable(item),
    location,
    branch,
    department,
    status: item.status || "Active",
    lastMaintenanceDate: item.updated_at ? item.updated_at.slice(0, 10) : null,
    responsibleTechnician: null,
    source: "backend",
  }
}

export function findMockAssetByCode(assetCode: string): AssetQrReportAsset | null {
  const normalized = normalizeAssetCode(assetCode)
  return mockAssetCatalog.find((item) => normalizeAssetCode(item.assetCode) === normalized) ?? null
}

export function enrichAssetWithMockMetadata(asset: AssetQrReportAsset): AssetQrReportAsset {
  const mock = findMockAssetByCode(asset.assetCode)
  if (!mock) {
    return asset
  }

  return {
    ...asset,
    branch: asset.branch || mock.branch,
    department: asset.department || mock.department,
    location: asset.location || mock.location,
    status: asset.status || mock.status,
    lastMaintenanceDate: asset.lastMaintenanceDate || mock.lastMaintenanceDate,
    responsibleTechnician: asset.responsibleTechnician || mock.responsibleTechnician,
  }
}

export function getMockAssetCatalog(): AssetQrReportAsset[] {
  return mockAssetCatalog
}
