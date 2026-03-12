import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export function AdminFaultBackButton() {
  return (
    <Link
      href="/admin-fault/dashboard"
      aria-label="Return to dashboard"
      title="Return to dashboard"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#0072CE]/35 bg-white text-[#1E3A6D] shadow-sm transition hover:bg-[#EEF5FD] hover:text-[#0B4B84]"
    >
      <ArrowLeft className="h-4 w-4" />
    </Link>
  )
}

