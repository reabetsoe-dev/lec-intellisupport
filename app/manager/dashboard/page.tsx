import Link from "next/link"
import { BarChart3, Boxes, ClipboardList, type LucideIcon } from "lucide-react"

import { EmployeePageHero } from "@/components/layout/EmployeePageHero"
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
    href: "/manager/tickets",
    title: "Ticket Oversight",
    description: "Monitor live ticket flow, ownership, and unresolved workload across operations.",
    icon: ClipboardList,
  },
  {
    href: "/manager/performance",
    title: "Performance Analytics",
    description: "Track throughput, resolution rates, and category-based performance trends.",
    icon: BarChart3,
  },
  {
    href: "/manager/resources",
    title: "Resource Oversight",
    description: "Review consumable request and return pressure before service delivery is impacted.",
    icon: Boxes,
  },
]

export default function ManagerDashboardPage() {
  return (
    <div className="space-y-6">
      <EmployeePageHero
        title="Manager Dashboard"
        description="Leadership workspace for end-to-end service oversight, KPI governance, and operational risk visibility."
      />

      <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
        <CardHeader className="px-6 py-5">
          <CardTitle className="text-base font-semibold text-[#0B1F3A]">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 px-6 pb-6 md:grid-cols-2 xl:grid-cols-3">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.title}
                href={action.href}
                className={getInterfaceActionCardClassName()}
              >
                <span className={getInterfaceCardIconClassName()}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="space-y-1">
                  <span className={getInterfaceCardTitleClassName()}>
                    {action.title}
                  </span>
                  <span className={getInterfaceCardDescriptionClassName()}>
                    {action.description}
                  </span>
                </span>
              </Link>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
