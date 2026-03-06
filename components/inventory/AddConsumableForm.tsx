"use client"

import { useState } from "react"

import { addConsumable } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type FormValues = {
  itemName: string
  brand: string
  modelNumber: string
  serialNumber: string
  category: string
  quantity: string
  department: string
  condition: string
  purchaseDate: string
}

type FormErrors = Partial<Record<keyof FormValues, string>>

const initialValues: FormValues = {
  itemName: "",
  brand: "",
  modelNumber: "",
  serialNumber: "",
  category: "Laptop",
  quantity: "1",
  department: "Finance",
  condition: "New",
  purchaseDate: "",
}

export function AddConsumableForm() {
  const [values, setValues] = useState<FormValues>(initialValues)
  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const validate = (): boolean => {
    const nextErrors: FormErrors = {}
    if (!values.itemName.trim()) {
      nextErrors.itemName = "Item Name is required."
    }
    if (!values.brand.trim()) {
      nextErrors.brand = "Brand is required."
    }
    if (!values.modelNumber.trim()) {
      nextErrors.modelNumber = "Model Number is required."
    }
    if (!values.serialNumber.trim()) {
      nextErrors.serialNumber = "Serial Number is required."
    }
    const parsedQuantity = Number(values.quantity)
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      nextErrors.quantity = "Quantity must be at least 1."
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const updateValue = (field: keyof FormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: "" }))
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setSuccess("")
    if (!validate()) {
      return
    }

    try {
      setLoading(true)
      await addConsumable({
        item_name: values.itemName.trim(),
        brand: values.brand.trim(),
        model_number: values.modelNumber.trim(),
        serial_number: values.serialNumber.trim(),
        category: values.category,
        quantity: Number(values.quantity),
        department: values.department.trim(),
        condition: values.condition,
        status: values.condition,
        purchase_date: values.purchaseDate,
      })
      setSuccess("Consumable saved successfully.")
      setValues(initialValues)
      setErrors({})
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save consumable.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="rounded-xl border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 px-6 py-5">
        <CardTitle className="text-base font-semibold text-slate-900">Add Consumable</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-6 py-6">
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <label htmlFor="item-name" className="text-sm font-medium text-slate-700">
              Item Name
            </label>
            <Input
              id="item-name"
              value={values.itemName}
              onChange={(event) => updateValue("itemName", event.target.value)}
              placeholder="ThinkPad T14"
            />
            {errors.itemName ? <p className="text-xs text-rose-600">{errors.itemName}</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="brand" className="text-sm font-medium text-slate-700">
                Brand
              </label>
              <Input
                id="brand"
                value={values.brand}
                onChange={(event) => updateValue("brand", event.target.value)}
                placeholder="Lenovo"
              />
              {errors.brand ? <p className="text-xs text-rose-600">{errors.brand}</p> : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="model-number" className="text-sm font-medium text-slate-700">
                Model Number
              </label>
              <Input
                id="model-number"
                value={values.modelNumber}
                onChange={(event) => updateValue("modelNumber", event.target.value)}
                placeholder="20W0003AUS"
              />
              {errors.modelNumber ? <p className="text-xs text-rose-600">{errors.modelNumber}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="serial-number" className="text-sm font-medium text-slate-700">
                Serial Number
              </label>
              <Input
                id="serial-number"
                value={values.serialNumber}
                onChange={(event) => updateValue("serialNumber", event.target.value)}
                placeholder="R9-8X11-PQ2"
              />
              {errors.serialNumber ? <p className="text-xs text-rose-600">{errors.serialNumber}</p> : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="category" className="text-sm font-medium text-slate-700">
                Category
              </label>
              <select
                id="category"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
                value={values.category}
                onChange={(event) => updateValue("category", event.target.value)}
              >
                <option value="Laptop">Laptop</option>
                <option value="Cartridge">Cartridge</option>
                <option value="Paper">Paper</option>
                <option value="Mouse">Mouse</option>
                <option value="Keyboard">Keyboard</option>
                <option value="Monitor">Monitor</option>
                <option value="Headset">Headset</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="quantity" className="text-sm font-medium text-slate-700">
                Quantity
              </label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={values.quantity}
                onChange={(event) => updateValue("quantity", event.target.value)}
              />
              {errors.quantity ? <p className="text-xs text-rose-600">{errors.quantity}</p> : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="department" className="text-sm font-medium text-slate-700">
                Department
              </label>
              <Input
                id="department"
                value={values.department}
                onChange={(event) => updateValue("department", event.target.value)}
                placeholder="Finance"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="condition" className="text-sm font-medium text-slate-700">
                Condition
              </label>
              <select
                id="condition"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800"
                value={values.condition}
                onChange={(event) => updateValue("condition", event.target.value)}
              >
                <option value="New">New</option>
                <option value="Used">Used</option>
                <option value="Damaged">Damaged</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="purchase-date" className="text-sm font-medium text-slate-700">
                Purchase Date
              </label>
              <Input
                id="purchase-date"
                type="date"
                value={values.purchaseDate}
                onChange={(event) => updateValue("purchaseDate", event.target.value)}
              />
            </div>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

          <Button type="submit" disabled={loading} className="w-full bg-[#0072CE] text-white hover:bg-[#005da8]">
            {loading ? "Saving..." : "Save Consumable"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
