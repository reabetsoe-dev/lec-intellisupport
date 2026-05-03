"use client"

import { Loader2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { addConsumable } from "@/lib/api"
import { ActionFeedbackDialog } from "@/components/ui/action-feedback-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type CategoryTab = "computer" | "printer" | "gadget"
type YesNo = "Yes" | "No" | ""
type AssetCondition = "New" | "Refurbished" | ""

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
  quantity: string
  purchaseCost: string
  supplier: string
  warrantyExpiry: string
  condition: AssetCondition
}

const initialForm: AssetForm = {
  assetTag: "",
  categoryType: "",
  brand: "",
  model: "",
  serial: "",
  manufacturer: "",
  processor: "",
  ram: "",
  storageType: "",
  storageCapacity: "",
  graphicsCard: "",
  chargerIncluded: "",
  monitorIncluded: "",
  keyboardIncluded: "",
  mouseIncluded: "",
  printSpeed: "",
  connectivity: "",
  duplexPrinting: "",
  paperCapacity: "",
  colorPrinting: "",
  operatingSystem: "",
  batteryCapacity: "",
  imeiNumber: "",
  purchaseDate: "",
  quantity: "",
  purchaseCost: "",
  supplier: "",
  warrantyExpiry: "",
  condition: "",
}

const categoryTypeOptions: Record<CategoryTab, string[]> = {
  computer: ["Laptop", "Desktop"],
  printer: ["Laser", "Inkjet", "Thermal"],
  gadget: ["Smartphone", "Tablet", "Router", "Scanner", "Webcam"],
}

const brandOptions: Record<CategoryTab, string[]> = {
  computer: ["Dell", "HP", "Lenovo", "Apple", "Acer", "ASUS", "MSI"],
  printer: ["HP", "Canon", "Epson", "Brother", "Xerox", "Ricoh", "Kyocera"],
  gadget: ["Samsung", "Apple", "Huawei", "Xiaomi", "TP-Link", "D-Link", "Logitech"],
}

const processorOptions = [
  "Intel Core i3",
  "Intel Core i5",
  "Intel Core i7",
  "Intel Core i9",
  "AMD Ryzen 5",
  "AMD Ryzen 7",
  "AMD Ryzen 9",
  "Apple M1",
  "Apple M2",
  "Apple M3",
]

const computerRamOptions = ["8 GB", "16 GB", "32 GB", "64 GB"]
const gadgetRamOptions = ["4 GB", "6 GB", "8 GB", "12 GB", "16 GB"]
const storageTypeOptions = ["SSD", "HDD", "NVMe SSD", "eMMC", "UFS"]
const computerStorageCapacityOptions = ["256 GB", "512 GB", "1 TB", "2 TB"]
const gadgetStorageCapacityOptions = ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB"]
const graphicsCardOptions = [
  "Integrated",
  "NVIDIA GeForce RTX 3050",
  "NVIDIA GeForce RTX 4060",
  "NVIDIA Quadro T1000",
  "AMD Radeon RX 6600",
  "AMD Radeon RX 7600",
]
const printerConnectivityOptions = ["USB", "USB / Ethernet", "USB / WiFi", "USB / WiFi / Ethernet", "WiFi / Ethernet"]
const printSpeedOptions = ["20 ppm", "30 ppm", "40 ppm", "50 ppm", "60 ppm"]
const paperCapacityOptions = ["100 sheets", "150 sheets", "250 sheets", "500 sheets", "550 sheets"]
const operatingSystemOptions = ["Android", "iOS", "Windows 11", "Windows 10", "macOS", "Linux"]
const batteryCapacityOptions = ["3000 mAh", "4000 mAh", "5000 mAh", "6000 mAh", "7000 mAh"]
const yesNoOptions: YesNo[] = ["Yes", "No"]
const conditionOptions: AssetCondition[] = ["New", "Refurbished"]
const selectClassName =
  "h-10 w-full rounded-md border border-[#93AECA] bg-white px-3 text-sm text-[#20466D] focus:outline-none focus:ring-2 focus:ring-[#0072CE]/30"

function boolFromYesNo(value: YesNo): boolean | undefined {
  if (value === "") {
    return undefined
  }
  return value === "Yes"
}

function sectionTitle(title: string, subtitle: string) {
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold text-[#0B1F3A]">{title}</h4>
      <p className="text-xs text-[#4A6A96]">{subtitle}</p>
    </div>
  )
}

export function AddConsumableForm() {
  const router = useRouter()
  const [tab, setTab] = useState<CategoryTab>("computer")
  const [form, setForm] = useState<AssetForm>(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [noWarrantyExpiry, setNoWarrantyExpiry] = useState(false)
  const [resultDialog, setResultDialog] = useState<{
    open: boolean
    status: "success" | "info"
    message: string
  }>({
    open: false,
    status: "success",
    message: "",
  })

  const tabLabel = useMemo(() => (tab === "computer" ? "Computer" : tab === "printer" ? "Printer" : "Gadget"), [tab])
  const isLaptop = tab === "computer" && form.categoryType === "Laptop"
  const isDesktop = tab === "computer" && form.categoryType === "Desktop"

  const update = <T extends keyof AssetForm>(key: T, value: AssetForm[T]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const showActionFeedback = (status: "success" | "info", message: string) => {
    setResultDialog({
      open: true,
      status,
      message,
    })
  }

  useEffect(() => {
    setNoWarrantyExpiry(false)
    setForm((prev) => ({
      ...prev,
      categoryType: "",
      brand: "",
      processor: "",
      ram: "",
      storageType: "",
      storageCapacity: "",
      graphicsCard: "",
      chargerIncluded: "",
      monitorIncluded: "",
      keyboardIncluded: "",
      mouseIncluded: "",
      printSpeed: "",
      connectivity: "",
      duplexPrinting: "",
      paperCapacity: "",
      colorPrinting: "",
      operatingSystem: "",
      batteryCapacity: "",
      quantity: "",
      condition: "",
    }))
  }, [tab])

  const resetForm = () => {
    setForm(initialForm)
    setNoWarrantyExpiry(false)
    setError("")
  }

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    if (!form.assetTag || !form.categoryType || !form.brand || !form.model || !form.serial || !form.purchaseDate || !form.quantity || !form.purchaseCost || !form.supplier || !form.condition) {
      setError("Asset Tag, Type, Brand, Model, Serial Number, Purchase Date, Quantity, Purchase Cost, Supplier, and Condition are required.")
      return
    }

    const quantity = Number(form.quantity.replace(/[^0-9]/g, ""))
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Quantity must be a valid number greater than 0.")
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
        quantity,
        purchase_cost: purchaseCost,
        supplier: form.supplier,
        purchase_date: form.purchaseDate,
        warranty_expiry: noWarrantyExpiry ? undefined : form.warrantyExpiry || undefined,
        condition: form.condition,
        status: "In Stock",
      })
      showActionFeedback("success", "Asset added to inventory.")
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add asset.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-xl border border-[#0072CE]/25 bg-[#F7FBFF] py-0 shadow-sm">
        <CardHeader className="border-b border-[#BBD1E8] px-6 py-5">
          <CardTitle className="text-base font-semibold text-[#0B1F3A]">Add Inventory Item</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-6 py-6">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className={tab === "computer" ? "border-[#0072CE] bg-[#0072CE] text-white hover:bg-[#005EA8] hover:text-white" : "border-[#93AECA] bg-white text-[#20466D] hover:bg-[#E8F3FF]"}
              onClick={() => setTab("computer")}
            >
              Computer
            </Button>
            <Button
              type="button"
              variant="outline"
              className={tab === "printer" ? "border-[#0072CE] bg-[#0072CE] text-white hover:bg-[#005EA8] hover:text-white" : "border-[#93AECA] bg-white text-[#20466D] hover:bg-[#E8F3FF]"}
              onClick={() => setTab("printer")}
            >
              Printer
            </Button>
            <Button
              type="button"
              variant="outline"
              className={tab === "gadget" ? "border-[#0072CE] bg-[#0072CE] text-white hover:bg-[#005EA8] hover:text-white" : "border-[#93AECA] bg-white text-[#20466D] hover:bg-[#E8F3FF]"}
              onClick={() => setTab("gadget")}
            >
              Gadget
            </Button>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <section className="space-y-3 rounded-lg border border-[#C5D5E6] bg-white p-4">
              {sectionTitle(`${tabLabel} Information`, "Basic details for the asset.")}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input placeholder="Asset Tag (LEC-CMP-001)" value={form.assetTag} onChange={(e) => update("assetTag", e.target.value)} />
                <select className={selectClassName} value={form.categoryType} onChange={(e) => update("categoryType", e.target.value)}>
                  <option value="" disabled>Select type</option>
                  {categoryTypeOptions[tab].map((opt) => <option key={opt}>{opt}</option>)}
                </select>
                {tab === "gadget" ? (
                  <Input placeholder="Brand (Samsung, Apple, etc.)" value={form.brand} onChange={(e) => update("brand", e.target.value)} />
                ) : (
                  <select className={selectClassName} value={form.brand} onChange={(e) => update("brand", e.target.value)}>
                    <option value="" disabled>Select brand</option>
                    {brandOptions[tab].map((opt) => (
                      <option key={opt} value={opt}>
                        Brand: {opt}
                      </option>
                    ))}
                  </select>
                )}
                <Input placeholder="Model" value={form.model} onChange={(e) => update("model", e.target.value)} />
                <Input placeholder="Serial Number" value={form.serial} onChange={(e) => update("serial", e.target.value)} />
                <Input placeholder="Manufacturer" value={form.manufacturer} onChange={(e) => update("manufacturer", e.target.value)} />
              </div>
            </section>

              {tab === "computer" ? (
                <section className="space-y-3 rounded-lg border border-[#C5D5E6] bg-white p-4">
                  {sectionTitle("Hardware Specifications", "Capture core computer specs.")}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <select className={selectClassName} value={form.processor} onChange={(e) => update("processor", e.target.value)}>
                      <option value="" disabled>Select processor</option>
                      {processorOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          Processor: {opt}
                        </option>
                      ))}
                    </select>
                    <select className={selectClassName} value={form.ram} onChange={(e) => update("ram", e.target.value)}>
                      <option value="" disabled>Select RAM</option>
                      {computerRamOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          RAM: {opt}
                        </option>
                      ))}
                    </select>
                    <select className={selectClassName} value={form.storageType} onChange={(e) => update("storageType", e.target.value)}>
                      <option value="" disabled>Select storage type</option>
                      {storageTypeOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          Storage Type: {opt}
                        </option>
                      ))}
                    </select>
                    <select className={selectClassName} value={form.storageCapacity} onChange={(e) => update("storageCapacity", e.target.value)}>
                      <option value="" disabled>Select storage capacity</option>
                      {computerStorageCapacityOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          Storage Capacity: {opt}
                        </option>
                      ))}
                    </select>
                    <select className={selectClassName} value={form.graphicsCard} onChange={(e) => update("graphicsCard", e.target.value)}>
                      <option value="" disabled>Select graphics card</option>
                      {graphicsCardOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          Graphics Card: {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </section>
              ) : null}

              {isLaptop ? (
                <section className="space-y-3 rounded-lg border border-[#C5D5E6] bg-white p-4">
                  {sectionTitle("Laptop Details", "Laptop specific fields.")}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <select className={selectClassName} value={form.chargerIncluded} onChange={(e) => update("chargerIncluded", e.target.value as YesNo)}>
                      <option value="" disabled>Select charger inclusion</option>
                      {yesNoOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          Charger Included: {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </section>
              ) : null}

              {isDesktop ? (
                <section className="space-y-3 rounded-lg border border-[#C5D5E6] bg-white p-4">
                  {sectionTitle("Desktop Details", "Desktop accessory coverage.")}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <select className={selectClassName} value={form.monitorIncluded} onChange={(e) => update("monitorIncluded", e.target.value as YesNo)}>
                      <option value="" disabled>Select monitor inclusion</option>
                      {yesNoOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          Monitor Included: {opt}
                        </option>
                      ))}
                    </select>
                    <select className={selectClassName} value={form.keyboardIncluded} onChange={(e) => update("keyboardIncluded", e.target.value as YesNo)}>
                      <option value="" disabled>Select keyboard inclusion</option>
                      {yesNoOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          Keyboard Included: {opt}
                        </option>
                      ))}
                    </select>
                    <select className={selectClassName} value={form.mouseIncluded} onChange={(e) => update("mouseIncluded", e.target.value as YesNo)}>
                      <option value="" disabled>Select mouse inclusion</option>
                      {yesNoOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          Mouse Included: {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </section>
              ) : null}

              {tab === "printer" ? (
                <section className="space-y-3 rounded-lg border border-[#C5D5E6] bg-white p-4">
                  {sectionTitle("Technical Specifications", "Printer performance and capability fields.")}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <select className={selectClassName} value={form.printSpeed} onChange={(e) => update("printSpeed", e.target.value)}>
                      <option value="">Print Speed</option>
                      {printSpeedOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <select className={selectClassName} value={form.connectivity} onChange={(e) => update("connectivity", e.target.value)}>
                      <option value="" disabled>Select connectivity</option>
                      {printerConnectivityOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          Connectivity: {opt}
                        </option>
                      ))}
                    </select>
                    <select className={selectClassName} value={form.paperCapacity} onChange={(e) => update("paperCapacity", e.target.value)}>
                      <option value="">Paper Capacity</option>
                      {paperCapacityOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <select className={selectClassName} value={form.duplexPrinting} onChange={(e) => update("duplexPrinting", e.target.value as YesNo)}>
                      <option value="" disabled>Select duplex printing</option>
                      {yesNoOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          Duplex Printing: {opt}
                        </option>
                      ))}
                    </select>
                    <select className={selectClassName} value={form.colorPrinting} onChange={(e) => update("colorPrinting", e.target.value as YesNo)}>
                      <option value="" disabled>Select color printing</option>
                      {yesNoOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          Color Printing: {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </section>
              ) : null}

              {tab === "gadget" ? (
                <section className="space-y-3 rounded-lg border border-[#C5D5E6] bg-white p-4">
                  {sectionTitle("Device Specifications", "Gadget hardware and OS information.")}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <select className={selectClassName} value={form.operatingSystem} onChange={(e) => update("operatingSystem", e.target.value)}>
                      <option value="" disabled>Select operating system</option>
                      {operatingSystemOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          Operating System: {opt}
                        </option>
                      ))}
                    </select>
                    <select className={selectClassName} value={form.ram} onChange={(e) => update("ram", e.target.value)}>
                      <option value="" disabled>Select RAM</option>
                      {gadgetRamOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          RAM: {opt}
                        </option>
                      ))}
                    </select>
                    <select className={selectClassName} value={form.storageCapacity} onChange={(e) => update("storageCapacity", e.target.value)}>
                      <option value="" disabled>Select storage capacity</option>
                      {gadgetStorageCapacityOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          Storage Capacity: {opt}
                        </option>
                      ))}
                    </select>
                    <select className={selectClassName} value={form.batteryCapacity} onChange={(e) => update("batteryCapacity", e.target.value)}>
                      <option value="">Battery Capacity</option>
                      {batteryCapacityOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <Input placeholder="IMEI Number" value={form.imeiNumber} onChange={(e) => update("imeiNumber", e.target.value)} />
                  </div>
                </section>
              ) : null}

              <section className="space-y-3 rounded-lg border border-[#C5D5E6] bg-white p-4">
                {sectionTitle("Purchase Information", "Purchase, warranty, and condition fields.")}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#1E3A6D]">Purchase Date</label>
                    <Input
                      type="date"
                      placeholder="Purchase Date"
                      title="Purchase Date"
                      value={form.purchaseDate}
                      onChange={(e) => update("purchaseDate", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#1E3A6D]">Quantity</label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="Quantity"
                      value={form.quantity}
                      onChange={(e) => update("quantity", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#1E3A6D]">Purchase Cost</label>
                    <Input placeholder="Purchase Cost (Currency: M)" value={form.purchaseCost} onChange={(e) => update("purchaseCost", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#1E3A6D]">Supplier</label>
                    <Input placeholder="Supplier" value={form.supplier} onChange={(e) => update("supplier", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-[#1E3A6D]">Warranty Expiry (Optional)</label>
                    <Input
                      type="date"
                      placeholder="Warranty Expiry"
                      title="Warranty Expiry"
                      value={form.warrantyExpiry}
                      disabled={noWarrantyExpiry}
                      onChange={(e) => update("warrantyExpiry", e.target.value)}
                    />
                    <label className="flex items-center gap-2 text-xs text-[#4A6A96]">
                      <input
                        type="checkbox"
                        checked={noWarrantyExpiry}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setNoWarrantyExpiry(checked)
                          if (checked) {
                            update("warrantyExpiry", "")
                          }
                        }}
                      />
                      No Warranty Expiry
                    </label>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#1E3A6D]">Condition</label>
                    <select className={selectClassName} value={form.condition} onChange={(e) => update("condition", e.target.value as AssetCondition)}>
                      <option value="" disabled>Select condition</option>
                      {conditionOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          Condition: {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting} className="bg-[#0072CE] text-white hover:bg-[#005DA8]">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitting ? "Adding..." : "Add Asset"}
                </Button>
              </div>
          </form>
        </CardContent>
      </Card>

      <ActionFeedbackDialog
        open={resultDialog.open}
        status={resultDialog.status}
        message={resultDialog.message}
        onOk={() => setResultDialog((current) => ({ ...current, open: false }))}
        secondaryActionLabel={resultDialog.status === "success" ? "Return to Dashboard" : undefined}
        onSecondaryAction={
          resultDialog.status === "success"
            ? () => {
                setResultDialog((current) => ({ ...current, open: false }))
                router.push("/admin-consumables/dashboard")
              }
            : undefined
        }
      />
    </div>
  )
}
