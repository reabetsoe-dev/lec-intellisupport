"use client"

import Link from "next/link"
import { useState } from "react"
import { Boxes, ClipboardCheck, History, type LucideIcon } from "lucide-react"

import { AdminConsumableRequestApprovalPanel } from "@/components/consumables/AdminConsumableRequestApprovalPanel"
import { AdminConsumablesBackButton } from "@/components/layout/AdminConsumablesBackButton"
import { EmployeePageHero } from "@/components/layout/EmployeePageHero"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getInterfaceActionCardClassName,
  getInterfaceCardDescriptionClassName,
  getInterfaceCardIconClassName,
  getInterfaceCardTitleClassName,
} from "@/lib/interface-card-styles"

const quickLinks: Array<{
  href: string
  title: string
  description: string
  icon: LucideIcon
}> = [
  {
    href: "/admin-consumables/inventory",
    title: "Assets",
    description: "Manage inventory assets, stock records, and new additions.",
    icon: Boxes,
  },
]

export default function AdminConsumablesDashboardPage() {
  const [showRequestQueue, setShowRequestQueue] = useState(false)
  const [showReturnQueue, setShowReturnQueue] = useState(false)

  return (
    <div className="space-y-6">
      {showRequestQueue || showReturnQueue ? (
        <AdminConsumablesBackButton
          label="Return to admin consumables main dashboard"
          onClick={() => {
            setShowRequestQueue(false)
            setShowReturnQueue(false)
          }}
        />
      ) : null}

      <EmployeePageHero
        title="Admin Consumables Dashboard"
        description="Review employee consumable requests and manage stock movement from one operational workspace."
      />

      <Card className="rounded-xl border-[#0072CE]/25 bg-white py-0 shadow-sm">
        <CardHeader className="px-6 py-5">
          <CardTitle className="text-base font-semibold text-[#0B1F3A]">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 px-6 pb-6 md:grid-cols-2 xl:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setShowRequestQueue((current) => !current)
              setShowReturnQueue(false)
            }}
            className={getInterfaceActionCardClassName(showRequestQueue)}
          >
            <span className={getInterfaceCardIconClassName(showRequestQueue)}>
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <span className="space-y-1">
              <span className={getInterfaceCardTitleClassName(showRequestQueue)}>Request Approvals</span>
              <span className={getInterfaceCardDescriptionClassName(showRequestQueue)}>
                Review employee consumable requests and approve allocations.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowReturnQueue((current) => !current)
              setShowRequestQueue(false)
            }}
            className={getInterfaceActionCardClassName(showReturnQueue)}
          >
            <span className={getInterfaceCardIconClassName(showReturnQueue)}>
              <History className="h-5 w-5" />
            </span>
            <span className="space-y-1">
              <span className={getInterfaceCardTitleClassName(showReturnQueue)}>Process Returns</span>
              <span className={getInterfaceCardDescriptionClassName(showReturnQueue)}>
                Open the consumable return queue and process hand-back requests.
              </span>
            </span>
          </button>

          {quickLinks.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.href}
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

      {showRequestQueue || showReturnQueue ? (
        <AdminConsumableRequestApprovalPanel
          showRequestQueue={showRequestQueue}
          showReturnQueue={showReturnQueue}
        />
      ) : null}
    </div>
  )
}
