import { EmployeeConsumableRequestPanel } from "@/components/consumables/EmployeeConsumableRequestPanel"

export default function TechnicianHardwareRequestPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Office Asset Request</h2>
        <p className="mt-1 text-sm text-slate-500">
          Request consumables/assets for your office use, same flow as employee requests.
        </p>
      </div>
      <EmployeeConsumableRequestPanel />
    </div>
  )
}
