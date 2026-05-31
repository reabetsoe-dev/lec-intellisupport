import Link from "next/link"
import { ClipboardList, PackagePlus, type LucideIcon } from "lucide-react"

import { EmployeePageHero } from "@/components/layout/EmployeePageHero"
import { TechnicianAvailabilityPanel } from "@/components/technician/TechnicianAvailabilityPanel"
import { TechnicianTicketTable } from "@/components/tickets/TechnicianTicketTable"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getInterfaceActionCardClassName,
  getInterfaceCardDescriptionClassName,
  getInterfaceCardIconClassName,
  getInterfaceCardTitleClassName,
} from "@/lib/interface-card-styles"

const quickActions: Array<{
  href: string
  title: string
  description: string
  icon: LucideIcon
}> = [
  {
    href: "/technician/tickets",
    title: "Assigned Tickets",
    description: "View the technician queue and work through active faults.",
    icon: ClipboardList,
  },
  {
    href: "/technician/hardware-request",
    title: "Office Asset Request",
    description: "Request the consumables or office IT items you need for field work.",
    icon: PackagePlus,
  },
]

export default function TechnicianDashboardPage() {
  return (
    <div className="space-y-4 lg:space-y-5">
      <EmployeePageHero
        title="Technician Dashboard"
        description="Service operations workspace for managing assigned tickets, progressing resolutions, and escalating faults when required."
        compact
      />

      <TechnicianAvailabilityPanel />

      <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-base font-semibold text-[#0B1F3A]">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 px-5 pb-5 md:grid-cols-2">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={`${action.href}-${action.title}`}
                href={action.href}
                className={getInterfaceActionCardClassName(false, "min-h-[92px] gap-2 p-3")}
              >
                <span className={getInterfaceCardIconClassName(false, "h-9 w-9")}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="space-y-1">
                  <span className={getInterfaceCardTitleClassName(false, "text-[15px]")}>{action.title}</span>
                  <span className={getInterfaceCardDescriptionClassName(false, "leading-5")}>{action.description}</span>
                </span>
              </Link>
            )
          })}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[#0B1F3A]">Assigned Tickets</h2>
          <p className="text-sm text-[#4A6A96]">
            Opening a ticket from a notification or ticket link starts it automatically. Waiting reports move across
            as soon as technician capacity opens up.
          </p>
        </div>
        <TechnicianTicketTable />
      </div>
    </div>
  )
}
