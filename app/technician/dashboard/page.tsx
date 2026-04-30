import Link from "next/link"
import { ClipboardList, PackagePlus, type LucideIcon } from "lucide-react"

import { EmployeePageHero } from "@/components/layout/EmployeePageHero"
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
    description: "Open the technician queue and work through active faults.",
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
    <div className="space-y-6">
      <EmployeePageHero
        title="Technician Dashboard"
        description="Service operations workspace for managing assigned tickets, progressing resolutions, and escalating faults when required."
      />

      <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
        <CardHeader className="px-6 py-5">
          <CardTitle className="text-base font-semibold text-[#0B1F3A]">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 px-6 pb-6 md:grid-cols-2 xl:grid-cols-2">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={`${action.href}-${action.title}`}
                href={action.href}
                className={getInterfaceActionCardClassName()}
              >
                <span className={getInterfaceCardIconClassName()}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="space-y-1">
                  <span className={getInterfaceCardTitleClassName()}>{action.title}</span>
                  <span className={getInterfaceCardDescriptionClassName()}>{action.description}</span>
                </span>
              </Link>
            )
          })}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-[#0B1F3A]">Assigned Tickets</h2>
          <p className="text-sm text-[#4A6A96]">
            Opening a pending ticket starts it automatically and the system will wait until that job is completed
            before assigning you another waiting report.
          </p>
        </div>
        <TechnicianTicketTable />
      </div>
    </div>
  )
}
