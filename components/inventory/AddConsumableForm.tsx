"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { addConsumable, getConsumables, type Consumable } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type ViewMode = "assets" | "add"
type CategoryTab = "computer" | "printer" | "gadget"
type SubmitMode = "add" | "save"
type YesNo = "Yes" | "No"
type AssetCondition = "New" | "Refurbished"

type AssetForm = {
  assetTag: string
  categoryType: string
  brand: string
  model: string
  serial: string
  manufacturer: string
  processor: string
  ram: string
  storageType: string
  storageCapacity: string
  graphicsCard: string
  chargerIncluded: YesNo
  monitorIncluded: YesNo
  keyboardIncluded: YesNo
  mouseIncluded: YesNo
  printSpeed: string
  connectivity: string
  duplexPrinting: YesNo
  paperCapacity: string
  colorPrinting: YesNo
  operatingSystem: string
  batteryCapacity: string
  imeiNumber: string
  purchaseDate: string
  purchaseCost: string
  supplier: string
  warrantyExpiry: string
  condition: AssetCondition
}

const initialForm: AssetForm = {
  assetTag: "",
  categoryType: "Laptop",
  brand: "",
  model: "",
  serial: "",
  manufacturer: "",
  processor: "Intel Core i7",
  ram: "16 GB",
  storageType: "SSD",
  storageCapacity: "512 GB",
  graphicsCard: "Integrated",
  chargerIncluded: "Yes",
  monitorIncluded: "Yes",
  keyboardIncluded: "Yes",
  mouseIncluded: "Yes",
  printSpeed: "",
  connectivity: "USB / WiFi / Ethernet",
  duplexPrinting: "Yes",
  paperCapacity: "",
  colorPrinting: "No",
  operatingSystem: "Android",
  batteryCapacity: "",
  imeiNumber: "",
  purchaseDate: "",
  purchaseCost: "",
  supplier: "",
  warrantyExpiry: "",
  condition: "New",
}

const categoryTypeOptions: Record<CategoryTab, string[]> = {
  computer: ["Laptop", "Desktop"],
  printer: ["Laser", "Inkjet", "Thermal"],
  gadget: ["Smartphone", "Tablet", "Router", "Scanner", "Webcam"],
}

function boolFromYesNo(value: YesNo): boolean {
  return value === "Yes"
}

function fmtCost(value?: number | null): string {
  return value === null || value === undefined ? "N/A" : `M ${value.toLocaleString()}`
}

function sectionTitle(title: string, subtitle: string) {
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <p className="text-xs text-slate-500">{subtitle}</p>
    </div>
  )
}

export function AddConsumableForm() {
  const router = useRouter()
  const [view, setView] = useState<ViewMode>("assets")
  const [tab, setTab] = useState<CategoryTab>("computer")
  const [mode, setMode] = useState<SubmitMode>("add")
  const [form, setForm] = useState<AssetForm>(initialForm)
  const [assets, setAssets] = useState<Consumable[]>([])
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [successOpen, setSuccessOpen] = useState(false)

  const tabLabel = useMemo(() => (tab === "computer" ? "Computer" : tab === "printer" ? "Printer" : "Gadget"), [tab])
  const isLaptop = tab === "computer" && form.categoryType === "Laptop"
  const isDesktop = tab === "computer" && form.categoryType === "Desktop"

  const update = <T extends keyof AssetForm>(key: T, value: AssetForm[T]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const loadAssets = async () => {
    try {
      setLoadingAssets(true)
      setAssets(await getConsumables())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load assets.")
    } finally {
      setLoadingAssets(false)
    }
  }

  useEffect(() => {
    void loadAssets()
  }, [])

  useEffect(() => {
    setForm((prev) => ({ ...prev, categoryType: categoryTypeOptions[tab][0] ?? "" }))
  }, [tab])

  const onCancel = () => {
    setForm(initialForm)
    setError("")
  }

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    if (!form.assetTag || !form.brand || !form.model || !form.serial || !form.purchaseDate || !form.purchaseCost || !form.supplier) {
      setError("Asset Tag, Brand, Model, Serial Number, Purchase Date, Purchase Cost, and Supplier are required.")
      return
    }

    const purchaseCost = Number(form.purchaseCost.replace(/[^0-9.-]/g, ""))
    if (!Number.isFinite(purchaseCost) || purchaseCost < 0) {
      setError("Purchase Cost must be a valid number.")
      return
    }

    try {
      setSubmitting(true)
      const itemName = `${form.categoryType} ${form.brand} ${form.model}`.trim()
      await addConsumable({
        asset_tag: form.assetTag,
        item_name: itemName,
        manufacturer: form.manufacturer,
        brand: form.brand,
        model_number: form.model,
        serial_number: form.serial,
        category: tabLabel,
        subcategory: form.categoryType,
        processor: tab === "computer" ? form.processor : "",
        ram: tab !== "printer" ? form.ram : "",
        storage_type: tab === "computer" ? form.storageType : "",
        storage_capacity: tab !== "printer" ? form.storageCapacity : "",
        graphics_card: tab === "computer" ? form.graphicsCard : "",
        charger_included: isLaptop ? boolFromYesNo(form.chargerIncluded) : undefined,
        monitor_included: isDesktop ? boolFromYesNo(form.monitorIncluded) : undefined,
        keyboard_included: isDesktop ? boolFromYesNo(form.keyboardIncluded) : undefined,
        mouse_included: isDesktop ? boolFromYesNo(form.mouseIncluded) : undefined,
        printer_type: tab === "printer" ? form.categoryType : "",
        print_speed: tab === "printer" ? form.printSpeed : "",
        connectivity: tab === "printer" ? form.connectivity : "",
        duplex_printing: tab === "printer" ? boolFromYesNo(form.duplexPrinting) : undefined,
        paper_capacity: tab === "printer" ? form.paperCapacity : "",
        color_printing: tab === "printer" ? boolFromYesNo(form.colorPrinting) : undefined,
        device_type: tab === "gadget" ? form.categoryType : "",
        operating_system: tab === "gadget" ? form.operatingSystem : "",
        battery_capacity: tab === "gadget" ? form.batteryCapacity : "",
        imei_number: tab === "gadget" ? form.imeiNumber : "",
        quantity: 1,
        purchase_cost: purchaseCost,
        supplier: form.supplier,
        purchase_date: form.purchaseDate,
        warranty_expiry: form.warrantyExpiry || undefined,
        condition: form.condition,
        status: "In Stock",
      })
      await loadAssets()
      setSuccessOpen(true)
      if (mode === "add") {
        onCancel()
        setView("assets")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add asset.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" variant={view === "assets" ? "default" : "outline"} onClick={() => setView("assets")}>Assets</Button>
        <Button type="button" variant={view === "add" ? "default" : "outline"} onClick={() => setView("add")}>+ Asset</Button>
      </div>

      {view === "assets" ? (
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="border-b border-slate-100 px-6 py-5"><CardTitle className="text-base font-semibold text-slate-900">All Assets in Inventory</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-6 text-xs font-semibold tracking-wide text-slate-500 uppercase">Asset Tag</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Category</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Type</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Brand / Model</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Serial</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Condition</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAssets ? (
                  <TableRow><TableCell colSpan={7} className="px-6 py-6 text-center text-sm text-slate-500">Loading assets...</TableCell></TableRow>
                ) : assets.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="px-6 py-6 text-center text-sm text-slate-500">No assets added yet.</TableCell></TableRow>
                ) : (
                  assets.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell className="px-6 font-medium text-slate-800">{asset.asset_tag || "N/A"}</TableCell>
                      <TableCell className="text-slate-700">{asset.category || "N/A"}</TableCell>
                      <TableCell className="text-slate-700">{asset.subcategory || asset.device_type || asset.printer_type || "N/A"}</TableCell>
                      <TableCell className="text-slate-700">{asset.brand || "N/A"} {asset.model_number || ""}</TableCell>
                      <TableCell className="text-slate-700">{asset.serial_number || "N/A"}</TableCell>
                      <TableCell><Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">{asset.condition || "N/A"}</Badge></TableCell>
                      <TableCell className="text-slate-700">{fmtCost(asset.purchase_cost)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
          <CardHeader className="border-b border-slate-100 px-6 py-5"><CardTitle className="text-base font-semibold text-slate-900">Add Inventory Item</CardTitle></CardHeader>
          <CardContent className="space-y-4 px-6 py-6">
            <div className="flex gap-2">
              <Button type="button" variant={tab === "computer" ? "default" : "outline"} onClick={() => setTab("computer")}>Computer</Button>
              <Button type="button" variant={tab === "printer" ? "default" : "outline"} onClick={() => setTab("printer")}>Printer</Button>
              <Button type="button" variant={tab === "gadget" ? "default" : "outline"} onClick={() => setTab("gadget")}>Gadget</Button>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              <section className="space-y-3 rounded-lg border border-slate-200 p-4">
                {sectionTitle(`${tabLabel} Information`, "Basic details for the asset.")}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input placeholder="Asset Tag (LEC-CMP-001)" value={form.assetTag} onChange={(e) => update("assetTag", e.target.value)} />
                  <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-800" value={form.categoryType} onChange={(e) => update("categoryType", e.target.value)}>
                    {categoryTypeOptions[tab].map((opt) => <option key={opt}>{opt}</option>)}
                  </select>
                  <Input placeholder="Brand (Dell, HP, Samsung)" value={form.brand} onChange={(e) => update("brand", e.target.value)} />
                  <Input placeholder="Model" value={form.model} onChange={(e) => update("model", e.target.value)} />
                  <Input placeholder="Serial Number" value={form.serial} onChange={(e) => update("serial", e.target.value)} />
                  <Input placeholder="Manufacturer" value={form.manufacturer} onChange={(e) => update("manufacturer", e.target.value)} />
                </div>
              </section>

              {tab === "computer" ? (
                <section className="space-y-3 rounded-lg border border-slate-200 p-4">
                  {sectionTitle("Hardware Specifications", "Capture core computer specs.")}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Input placeholder="Processor (Intel Core i7)" value={form.processor} onChange={(e) => update("processor", e.target.value)} />
                    <Input placeholder="RAM (16 GB)" value={form.ram} onChange={(e) => update("ram", e.target.value)} />
                    <Input placeholder="Storage Type (SSD)" value={form.storageType} onChange={(e) => update("storageType", e.target.value)} />
                    <Input placeholder="Storage Capacity (512 GB)" value={form.storageCapacity} onChange={(e) => update("storageCapacity", e.target.value)} />
                    <Input placeholder="Graphics Card (Integrated)" value={form.graphicsCard} onChange={(e) => update("graphicsCard", e.target.value)} />
                  </div>
                </section>
              ) : null}

              {isLaptop ? (
                <section className="space-y-3 rounded-lg border border-slate-200 p-4">
                  {sectionTitle("Laptop Details", "Laptop specific fields.")}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-800" value={form.chargerIncluded} onChange={(e) => update("chargerIncluded", e.target.value as YesNo)}>
                      <option value="Yes">Charger Included: Yes</option>
                      <option value="No">Charger Included: No</option>
                    </select>
                  </div>
                </section>
              ) : null}

              {isDesktop ? (
                <section className="space-y-3 rounded-lg border border-slate-200 p-4">
                  {sectionTitle("Desktop Details", "Desktop accessory coverage.")}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-800" value={form.monitorIncluded} onChange={(e) => update("monitorIncluded", e.target.value as YesNo)}>
                      <option value="Yes">Monitor Included: Yes</option>
                      <option value="No">Monitor Included: No</option>
                    </select>
                    <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-800" value={form.keyboardIncluded} onChange={(e) => update("keyboardIncluded", e.target.value as YesNo)}>
                      <option value="Yes">Keyboard Included: Yes</option>
                      <option value="No">Keyboard Included: No</option>
                    </select>
                    <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-800" value={form.mouseIncluded} onChange={(e) => update("mouseIncluded", e.target.value as YesNo)}>
                      <option value="Yes">Mouse Included: Yes</option>
                      <option value="No">Mouse Included: No</option>
                    </select>
                  </div>
                </section>
              ) : null}

              {tab === "printer" ? (
                <section className="space-y-3 rounded-lg border border-slate-200 p-4">
                  {sectionTitle("Technical Specifications", "Printer performance and capability fields.")}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Input placeholder="Print Speed (40 pages/min)" value={form.printSpeed} onChange={(e) => update("printSpeed", e.target.value)} />
                    <Input placeholder="Connectivity (USB / WiFi / Ethernet)" value={form.connectivity} onChange={(e) => update("connectivity", e.target.value)} />
                    <Input placeholder="Paper Capacity (250 sheets)" value={form.paperCapacity} onChange={(e) => update("paperCapacity", e.target.value)} />
                    <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-800" value={form.duplexPrinting} onChange={(e) => update("duplexPrinting", e.target.value as YesNo)}>
                      <option value="Yes">Duplex Printing: Yes</option>
                      <option value="No">Duplex Printing: No</option>
                    </select>
                    <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-800" value={form.colorPrinting} onChange={(e) => update("colorPrinting", e.target.value as YesNo)}>
                      <option value="Yes">Color Printing: Yes</option>
                      <option value="No">Color Printing: No</option>
                    </select>
                  </div>
                </section>
              ) : null}

              {tab === "gadget" ? (
                <section className="space-y-3 rounded-lg border border-slate-200 p-4">
                  {sectionTitle("Device Specifications", "Gadget hardware and OS information.")}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Input placeholder="Operating System (Android)" value={form.operatingSystem} onChange={(e) => update("operatingSystem", e.target.value)} />
                    <Input placeholder="RAM (6 GB)" value={form.ram} onChange={(e) => update("ram", e.target.value)} />
                    <Input placeholder="Storage Capacity (128 GB)" value={form.storageCapacity} onChange={(e) => update("storageCapacity", e.target.value)} />
                    <Input placeholder="Battery Capacity (5000 mAh)" value={form.batteryCapacity} onChange={(e) => update("batteryCapacity", e.target.value)} />
                    <Input placeholder="IMEI Number" value={form.imeiNumber} onChange={(e) => update("imeiNumber", e.target.value)} />
                  </div>
                </section>
              ) : null}

              <section className="space-y-3 rounded-lg border border-slate-200 p-4">
                {sectionTitle("Purchase Information", "Purchase, warranty, and condition fields.")}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input type="date" value={form.purchaseDate} onChange={(e) => update("purchaseDate", e.target.value)} />
                  <Input placeholder="Purchase Cost (M 18,000)" value={form.purchaseCost} onChange={(e) => update("purchaseCost", e.target.value)} />
                  <Input placeholder="Supplier" value={form.supplier} onChange={(e) => update("supplier", e.target.value)} />
                  <Input type="date" value={form.warrantyExpiry} onChange={(e) => update("warrantyExpiry", e.target.value)} />
                  <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-800" value={form.condition} onChange={(e) => update("condition", e.target.value as AssetCondition)}>
                    <option value="New">Condition: New</option>
                    <option value="Refurbished">Condition: Refurbished</option>
                  </select>
                </div>
              </section>

              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              <div className="flex gap-2">
                <Button type="submit" onClick={() => setMode("add")} disabled={submitting} className="bg-[#0072CE] text-white hover:bg-[#005DA8]">{submitting && mode === "add" ? "Adding..." : "Add Asset"}</Button>
                <Button type="submit" onClick={() => setMode("save")} disabled={submitting} variant="outline" className="border-slate-300">{submitting && mode === "save" ? "Saving..." : "Save"}</Button>
                <Button type="button" variant="outline" className="border-slate-300" onClick={onCancel}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asset Successfully Added</DialogTitle>
            <DialogDescription>The item has been successfully added to the inventory.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
            <Button className="bg-[#0B1F3A] text-white hover:bg-[#0F2A4F]" onClick={() => { setSuccessOpen(false); router.push("/admin-consumables/dashboard") }}>Return to Dashboard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
