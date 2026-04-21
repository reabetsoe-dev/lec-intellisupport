import Link from "next/link"
import { BarChart3, Clock3, type LucideIcon, PhoneCall, UsersRound } from "lucide-react"

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
    href: "/admin-fault/manage-users",
    title: "Manage Users",
    description: "Add or remove employees and technicians from the support system.",
    icon: UsersRound,
  },
  {
    href: "/admin-fault/performance",
    title: "Performance Analytics",
    description: "Track technician throughput and response trends by fault category.",
    icon: BarChart3,
  },
  {
    href: "/admin-fault/sla",
    title: "SLA Tracking",
    description: "Watch acceptance delays, breach exposure, and live escalation pressure in one place.",
    icon: Clock3,
  },
  {
    href: "/admin-fault/business-hours",
    title: "Business Hours",
    description: "Set support schedules, holidays, and group coverage for automated routing.",
    icon: Clock3,
  },
  {
    href: "/admin-fault/log-call",
    title: "Log Call",
    description: "Log fault calls for employees and capture caller details on their behalf.",
    icon: PhoneCall,
  },
]

export default function AdminFaultDashboardPage() {
  return (
    <div className="space-y-6">
      <EmployeePageHero
        title="Admin Fault Dashboard"
        description="Manage ticket lifecycle, ownership, technician coordination, and escalation workflow from one control center."
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

