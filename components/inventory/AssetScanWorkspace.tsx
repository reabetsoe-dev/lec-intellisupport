"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  CheckCircle2,
  Package2,
  RefreshCcw,
  ShieldCheck,
  SquareArrowOutUpRight,
  Tag,
  UserRound,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { adjustConsumableQuantity, getConsumableById, updateConsumable, type Consumable } from "@/lib/api"
import { parseAssetScanToken } from "@/lib/asset-qr"
import { getStoredUserSession, type AuthUser } from "@/lib/auth"

type AssetScanWorkspaceProps = {
  token: string
}

type ActionMode = "check_out" | "check_in" | "update_condition"

function getAssetType(asset: Consumable): string {
  return asset.subcategory || asset.device_type || asset.printer_type || asset.item_name || "N/A"
}

function getAssetBrandModel(asset: Consumable): string {
  return `${asset.brand || ""} ${asset.model_number || ""}`.trim() || asset.item_name || "N/A"
}

function formatRoleLabel(role: string): string {
  return role
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

function getConditionTone(condition: string): string {
  const normalized = condition.toLowerCase()
  if (normalized.includes("new")) {
    return "border-emerald-300/60 bg-emerald-100/70 text-emerald-800"
  }
  if (normalized.includes("refurb")) {
    return "border-amber-300/70 bg-amber-100/80 text-amber-900"
  }
  if (normalized.includes("fault") || normalized.includes("damag")) {
    return "border-rose-300/70 bg-rose-100/80 text-rose-800"
  }
  return "border-sky-300/70 bg-sky-100/80 text-sky-900"
}

function getStatusTone(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized.includes("stock")) {
    return "border-cyan-300/70 bg-cyan-100/80 text-cyan-900"
  }
  if (normalized.includes("assign")) {
    return "border-indigo-300/70 bg-indigo-100/80 text-indigo-900"
  }
  if (normalized.includes("return")) {
    return "border-fuchsia-300/70 bg-fuchsia-100/80 text-fuchsia-900"
  }
  return "border-slate-300/70 bg-slate-100/80 text-slate-900"
}

const CONDITION_OPTIONS = ["New", "Good", "Refurbished", "Damaged", "Faulty", "Retired"]
const STATUS_OPTIONS = [
  "In Stock",
  "Assigned",
  "Checked Out",
  "Under Maintenance",
  "Returned",
  "Reserved",
  "Disposed",
]

type MetricCardProps = {
  icon: LucideIcon
  label: string
  value: string
  toneClassName?: string
}

function MetricCard({ icon: Icon, label, value, toneClassName }: MetricCardProps) {
  return (
    <article className="rounded-2xl border border-[#B8D6F0] bg-white/85 p-4 shadow-[0_16px_38px_-28px_rgba(9,41,79,0.7)] backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#B7D5EF] bg-[#EEF6FF] text-[#184A75]">
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs font-semibold tracking-[0.14em] text-[#386289] uppercase">{label}</p>
      </div>
      <p className="mt-2 text-[22px] leading-tight font-semibold text-[#08294F]">{value}</p>
      {toneClassName ? (
        <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${toneClassName}`}>
          {value}
        </span>
      ) : null}
    </article>
  )
}

export function AssetScanWorkspace({ token }: AssetScanWorkspaceProps) {
  const [sessionReady, setSessionReady] = useState(false)
  const [session, setSession] = useState<AuthUser | null>(null)
  const [asset, setAsset] = useState<Consumable | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingError, setLoadingError] = useState("")
  const [actionMode, setActionMode] = useState<ActionMode>("check_out")
  const [quantity, setQuantity] = useState("1")
  const [condition, setCondition] = useState("")
  const [statusValue, setStatusValue] = useState("")
  const [runningAction, setRunningAction] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const conditionOptions = useMemo(() => {
    const normalizedCondition = condition.trim()
    if (normalizedCondition && !CONDITION_OPTIONS.includes(normalizedCondition)) {
      return [normalizedCondition, ...CONDITION_OPTIONS]
    }
    return CONDITION_OPTIONS
  }, [condition])

  const statusOptions = useMemo(() => {
    const normalizedStatus = statusValue.trim()
    if (normalizedStatus && !STATUS_OPTIONS.includes(normalizedStatus)) {
      return [normalizedStatus, ...STATUS_OPTIONS]
    }
    return STATUS_OPTIONS
  }, [statusValue])

  const tokenPayload = useMemo(() => parseAssetScanToken(token), [token])

  const loadAsset = useCallback(async () => {
    if (!tokenPayload) {
      setLoadingError("Invalid scan token.")
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setLoadingError("")
      const nextAsset = await getConsumableById(tokenPayload.asset_id)
      setAsset(nextAsset)
      setCondition(nextAsset.condition || "")
      setStatusValue(nextAsset.status || "")
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : "Failed to load this asset.")
    } finally {
      setLoading(false)
    }
  }, [tokenPayload])

  useEffect(() => {
    const currentSession = getStoredUserSession()
    setSession(currentSession)
    setSessionReady(true)
  }, [])

  useEffect(() => {
    void loadAsset()
  }, [loadAsset])

  const runAction = async () => {
    if (!asset) {
      return
    }
    setActionMessage(null)

    const parsedQuantity = Number.parseInt(quantity, 10)
    if (actionMode !== "update_condition" && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)) {
      setActionMessage({ type: "error", text: "Quantity must be a number greater than 0." })
      return
    }

    if (actionMode === "update_condition" && !condition.trim() && !statusValue.trim()) {
      setActionMessage({ type: "error", text: "Provide a condition or status update first." })
      return
    }

    try {
      setRunningAction(true)
      if (actionMode === "check_out") {
        await adjustConsumableQuantity(asset.id, -Math.abs(parsedQuantity))
      } else if (actionMode === "check_in") {
        await adjustConsumableQuantity(asset.id, Math.abs(parsedQuantity))
      } else {
        await updateConsumable(asset.id, {
          condition: condition.trim(),
          status: statusValue.trim(),
        })
      }
      await loadAsset()
      const nextMessage =
        actionMode === "check_out"
          ? `Checked out ${Math.abs(parsedQuantity)} item(s).`
          : actionMode === "check_in"
            ? `Checked in ${Math.abs(parsedQuantity)} item(s).`
            : "Condition/status updated."
      setActionMessage({ type: "success", text: nextMessage })
      if (actionMode !== "update_condition") {
        setQuantity("1")
      }
    } catch (error) {
      setActionMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Action failed. Please try again.",
      })
    } finally {
      setRunningAction(false)
    }
  }

  return (
    <div className="relative space-y-6 overflow-hidden rounded-3xl border border-[#9EC5EB]/55 bg-[radial-gradient(circle_at_top_left,_#F6FCFF_0%,_#E9F5FF_40%,_#E2F0FF_100%)] p-4 shadow-[0_28px_62px_-42px_rgba(8,42,80,0.85)] md:p-6">
      <div className="pointer-events-none absolute -top-20 -left-16 h-72 w-72 rounded-full bg-[#6DB6FF]/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-[#2A7FD0]/10 blur-3xl" />

      <Card className="relative overflow-hidden border-[#9EC7EA]/70 bg-gradient-to-br from-[#08315B] via-[#0D4477] to-[#1A5D97] shadow-[0_24px_58px_-34px_rgba(3,26,49,0.9)]">
        <div className="pointer-events-none absolute -right-24 -bottom-24 h-72 w-72 rounded-full border border-white/10" />
        <CardHeader className="space-y-4 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-3xl leading-tight font-semibold text-white md:text-4xl">
                Asset QR/NFC Scan Workspace
              </CardTitle>
            </div>
            <Button asChild variant="outline" className="border-[#9DCAEE] bg-white/95 text-[#063564] shadow-sm">
              <Link href="/admin-consumables/inventory">
                <ArrowLeft className="h-4 w-4" />
                Return to Inventory
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-[#EAF7FF] backdrop-blur">
              <p className="mb-1 text-xs font-semibold tracking-[0.14em] uppercase text-[#B8DEFF]">Scan Token</p>
              <p className="break-all font-mono text-sm">{token || "N/A"}</p>
            </div>

            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-[#EAF7FF] backdrop-blur">
              <p className="mb-1 text-xs font-semibold tracking-[0.14em] uppercase text-[#B8DEFF]">Session</p>
              {sessionReady ? (
                session ? (
                  <p className="inline-flex items-center gap-2 text-sm font-medium">
                    <UserRound className="h-4 w-4" />
                    {session.name} ({formatRoleLabel(session.role)})
                  </p>
                ) : (
                  <p className="text-sm text-rose-200">No active browser session found.</p>
                )
              ) : (
                <p className="text-sm text-[#CDEBFF]">Checking browser session...</p>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border-[#A9CDEE] bg-white/80 shadow-[0_22px_48px_-34px_rgba(14,56,97,0.8)] backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-[26px] font-semibold text-[#092F57]">Asset Details</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="rounded-xl border border-[#B9D6EF] bg-[#F3F9FF] px-4 py-3 text-[#4E7095]">Loading asset details...</p>
          ) : loadingError ? (
            <p className="rounded-xl border border-[#EDB7B7] bg-[#FFF5F5] px-4 py-3 text-[#A83A3A]">{loadingError}</p>
          ) : !asset ? (
            <p className="rounded-xl border border-[#EDB7B7] bg-[#FFF5F5] px-4 py-3 text-[#A83A3A]">Asset not found.</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <MetricCard icon={Tag} label="Asset Tag" value={asset.asset_tag || "N/A"} />
                <MetricCard icon={Package2} label="Asset Name" value={getAssetBrandModel(asset)} />
                <MetricCard icon={Package2} label="Type" value={getAssetType(asset)} />
                <MetricCard icon={ShieldCheck} label="Quantity" value={String(asset.quantity ?? 0)} />
                <MetricCard icon={ShieldCheck} label="Condition" value={asset.condition || "N/A"} toneClassName={getConditionTone(asset.condition || "")} />
                <MetricCard icon={ShieldCheck} label="Status" value={asset.status || "N/A"} toneClassName={getStatusTone(asset.status || "")} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void loadAsset()} disabled={loading} className="border-[#82B7EA] bg-white text-[#0A2445]">
                  <RefreshCcw className="h-4 w-4" />
                  Refresh
                </Button>
                <Button asChild variant="outline" className="border-[#82B7EA] bg-white text-[#0A2445]">
                  <Link href={`/admin-consumables/inventory/labels?assetId=${asset.id}`} target="_blank" rel="noreferrer">
                    <SquareArrowOutUpRight className="h-4 w-4" />
                    Open Label
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {asset ? (
        <Card className="border-[#A6CBEA] bg-gradient-to-br from-[#FFFFFF] via-[#F9FCFF] to-[#EEF7FF] shadow-[0_22px_48px_-34px_rgba(14,56,97,0.7)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-[26px] font-semibold text-[#092F57]">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={actionMode === "check_out" ? "default" : "outline"}
                className={actionMode === "check_out" ? "shadow-[0_16px_28px_-20px_rgba(0,114,206,0.9)]" : "border-[#8CBCE9] bg-white"}
                onClick={() => setActionMode("check_out")}
              >
                Check Out
              </Button>
              <Button
                type="button"
                variant={actionMode === "check_in" ? "default" : "outline"}
                className={actionMode === "check_in" ? "shadow-[0_16px_28px_-20px_rgba(0,114,206,0.9)]" : "border-[#8CBCE9] bg-white"}
                onClick={() => setActionMode("check_in")}
              >
                Check In
              </Button>
              <Button
                type="button"
                variant={actionMode === "update_condition" ? "default" : "outline"}
                className={actionMode === "update_condition" ? "shadow-[0_16px_28px_-20px_rgba(0,114,206,0.9)]" : "border-[#8CBCE9] bg-white"}
                onClick={() => setActionMode("update_condition")}
              >
                Update Condition
              </Button>
            </div>

            {actionMode === "update_condition" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-[#BDD8EF] bg-white/90 p-3">
                  <Label htmlFor="condition-input" className="text-[#123A62]">
                    Condition
                  </Label>
                  <select
                    id="condition-input"
                    value={condition}
                    onChange={(event) => setCondition(event.target.value)}
                    className="h-10 w-full rounded-md border border-[#9BC4EA] bg-white px-3 text-sm text-[#0E325A] shadow-inner focus:outline-none focus:ring-2 focus:ring-[#4F9CE0]/35"
                  >
                    {conditionOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 rounded-xl border border-[#BDD8EF] bg-white/90 p-3">
                  <Label htmlFor="status-input" className="text-[#123A62]">
                    Status
                  </Label>
                  <select
                    id="status-input"
                    value={statusValue}
                    onChange={(event) => setStatusValue(event.target.value)}
                    className="h-10 w-full rounded-md border border-[#9BC4EA] bg-white px-3 text-sm text-[#0E325A] shadow-inner focus:outline-none focus:ring-2 focus:ring-[#4F9CE0]/35"
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="max-w-md space-y-2 rounded-xl border border-[#BDD8EF] bg-white/90 p-3">
                <Label htmlFor="qty-input" className="text-[#123A62]">
                  Quantity
                </Label>
                <Input
                  id="qty-input"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="border-[#9BC4EA] bg-white"
                />
              </div>
            )}

            {actionMessage ? (
              <p
                className={
                  actionMessage.type === "success"
                    ? "rounded-xl border border-[#A6E4C3] bg-[#ECFFF3] px-4 py-3 text-sm font-medium text-[#18704A]"
                    : "rounded-xl border border-[#EDB7B7] bg-[#FFF5F5] px-4 py-3 text-sm font-medium text-[#A83A3A]"
                }
              >
                {actionMessage.text}
              </p>
            ) : null}

            <Button onClick={() => void runAction()} disabled={runningAction} className="shadow-[0_16px_30px_-20px_rgba(0,114,206,0.9)]">
              <CheckCircle2 className="h-4 w-4" />
              {runningAction ? "Running..." : "Run Action"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
