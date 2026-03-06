export type TicketStatus = "Open" | "In Progress" | "Pending Vendor" | "Resolved"
export type TicketPriority = "Low" | "Medium" | "High" | "Critical"
export type TicketSla = "On Track" | "At Risk" | "Breached"

export type TicketComment = {
  author: string
  message: string
  time: string
}

export type TicketActivity = {
  type: string
  detail: string
  time: string
}

export type Ticket = {
  id: number
  title: string
  status: TicketStatus
  priority: TicketPriority
  sla: TicketSla
  technician: string
  requester: string
  createdAt: string
  updatedAt: string
  dueBy: string
  category: string
  service: string
  description: string
  comments: TicketComment[]
  activity: TicketActivity[]
}

export const tickets: Ticket[] = [
  {
    id: 1001,
    title: "VPN access unavailable for remote finance users",
    status: "In Progress",
    priority: "High",
    sla: "At Risk",
    technician: "Teboho M.",
    requester: "Finance Team",
    createdAt: "2026-03-01 08:45",
    updatedAt: "2026-03-03 09:12",
    dueBy: "2026-03-03 14:00",
    category: "Network",
    service: "Remote Access",
    description:
      "Multiple finance users report failed VPN authentication after password rotation. Impact includes inability to access ERP from remote locations.",
    comments: [
      {
        author: "Teboho M.",
        message: "Validated firewall policy and discovered stale auth tokens on VPN gateway.",
        time: "2026-03-03 08:55",
      },
      {
        author: "Finance Team",
        message: "Issue affects month-end reporting process and requires urgent resolution.",
        time: "2026-03-03 07:43",
      },
    ],
    activity: [
      { type: "Status", detail: "Moved from Open to In Progress", time: "2026-03-03 08:50" },
      { type: "Assignment", detail: "Assigned to Teboho M.", time: "2026-03-03 08:48" },
      { type: "Created", detail: "Ticket created by Finance Team", time: "2026-03-01 08:45" },
    ],
  },
  {
    id: 1002,
    title: "Email delivery delay for external recipients",
    status: "Open",
    priority: "Medium",
    sla: "On Track",
    technician: "Neo K.",
    requester: "Sales Operations",
    createdAt: "2026-03-02 11:15",
    updatedAt: "2026-03-03 08:20",
    dueBy: "2026-03-04 11:15",
    category: "Messaging",
    service: "Email",
    description:
      "Outbound email to external domains is delayed by 20-30 minutes. Internal delivery remains unaffected.",
    comments: [
      {
        author: "Neo K.",
        message: "Started trace analysis on outbound connector queue.",
        time: "2026-03-03 08:20",
      },
    ],
    activity: [
      { type: "Investigation", detail: "Message trace initiated", time: "2026-03-03 08:20" },
      { type: "Created", detail: "Ticket created by Sales Operations", time: "2026-03-02 11:15" },
    ],
  },
  {
    id: 1003,
    title: "Payroll portal timeout during approvals",
    status: "Pending Vendor",
    priority: "Critical",
    sla: "Breached",
    technician: "Palesa R.",
    requester: "HR Operations",
    createdAt: "2026-02-28 10:00",
    updatedAt: "2026-03-03 10:05",
    dueBy: "2026-03-01 10:00",
    category: "Application",
    service: "Payroll",
    description:
      "Approval workflow times out consistently for batch submissions over 200 records. Vendor logs requested for root cause.",
    comments: [
      {
        author: "Palesa R.",
        message: "Escalated to vendor support and requested emergency patch timeline.",
        time: "2026-03-03 10:05",
      },
      {
        author: "HR Operations",
        message: "Monthly payroll processing is blocked for regional offices.",
        time: "2026-03-03 09:38",
      },
    ],
    activity: [
      { type: "SLA", detail: "SLA breached", time: "2026-03-01 10:01" },
      { type: "Escalation", detail: "Vendor escalation initiated", time: "2026-03-03 09:55" },
      { type: "Created", detail: "Ticket created by HR Operations", time: "2026-02-28 10:00" },
    ],
  },
  {
    id: 1004,
    title: "Printer queue stuck on 4th floor service desk",
    status: "Resolved",
    priority: "Low",
    sla: "On Track",
    technician: "Mpho L.",
    requester: "Facilities",
    createdAt: "2026-03-03 07:10",
    updatedAt: "2026-03-03 09:00",
    dueBy: "2026-03-04 07:10",
    category: "Endpoint",
    service: "Printing",
    description:
      "Shared office printer queue stalled due to corrupted print spooler service.",
    comments: [
      {
        author: "Mpho L.",
        message: "Restarted spooler, cleared queue, and validated test print.",
        time: "2026-03-03 08:58",
      },
    ],
    activity: [
      { type: "Resolution", detail: "Issue resolved and user confirmed", time: "2026-03-03 09:00" },
      { type: "Created", detail: "Ticket created by Facilities", time: "2026-03-03 07:10" },
    ],
  },
]

export const statusOptions: TicketStatus[] = ["Open", "In Progress", "Pending Vendor", "Resolved"]
export const priorityOptions: TicketPriority[] = ["Low", "Medium", "High", "Critical"]

export const statusBadgeStyles: Record<TicketStatus, string> = {
  Open: "bg-slate-100 text-slate-700 border border-slate-200",
  "In Progress": "bg-blue-50 text-blue-700 border border-blue-100",
  "Pending Vendor": "bg-amber-50 text-amber-700 border border-amber-100",
  Resolved: "bg-emerald-50 text-emerald-700 border border-emerald-100",
}

export const priorityBadgeStyles: Record<TicketPriority, string> = {
  Low: "bg-slate-100 text-slate-700 border border-slate-200",
  Medium: "bg-indigo-50 text-indigo-700 border border-indigo-100",
  High: "bg-orange-50 text-orange-700 border border-orange-100",
  Critical: "bg-rose-50 text-rose-700 border border-rose-100",
}

export const slaBadgeStyles: Record<TicketSla, string> = {
  "On Track": "bg-emerald-50 text-emerald-700 border border-emerald-100",
  "At Risk": "bg-amber-50 text-amber-700 border border-amber-100",
  Breached: "bg-rose-50 text-rose-700 border border-rose-100",
}
