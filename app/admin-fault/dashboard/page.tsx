import Link from "next/link"
import { BarChart3, ClipboardList, type LucideIcon, PhoneCall, UsersRound } from "lucide-react"

import { EmployeePageHero } from "@/components/layout/EmployeePageHero"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TechnicianManagementPanel } from "@/components/admin-fault/TechnicianManagementPanel"

const quickActions: Array<{
  href: string
  title: string
  description: string
  icon: LucideIcon
}> = [
  {
    href: "/admin-fault/tickets",
    title: "All Tickets",
    description: "View and manage assignment, status, and escalation across all faults.",
    icon: ClipboardList,
  },
  {
    href: "#technician-management",
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
        <CardContent className="grid grid-cols-1 gap-3 px-6 pb-6 md:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.title}
                href={action.href}
                className="group flex min-h-[112px] items-start gap-3 rounded-xl border border-[#0072CE]/25 bg-[#F7FBFF] p-4 transition hover:-translate-y-0.5 hover:border-[#0072CE]/60 hover:shadow-[0_10px_20px_rgba(0,114,206,0.16)]"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0072CE] text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="space-y-1">
                  <span className="block text-sm font-semibold text-[#0B1F3A]">{action.title}</span>
                  <span className="block text-xs leading-5 text-[#1E3A6D]">{action.description}</span>
                </span>
              </Link>
            )
          })}
        </CardContent>
      </Card>

      <TechnicianManagementPanel />
    </div>
  )
}

