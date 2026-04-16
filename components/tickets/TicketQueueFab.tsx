"use client"

import { MessageSquarePlus } from "lucide-react"

type TicketQueueFabProps = {
  onClick: () => void
  label?: string
}

export function TicketQueueFab({
  onClick,
  label = "Open ticket conversations",
}: TicketQueueFabProps) {
  return (
    <div className="group fixed bottom-6 right-6 z-50">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-500 text-white shadow-lg transition hover:scale-105 hover:bg-teal-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
      >
        <MessageSquarePlus className="h-6 w-6" />
      </button>
      <div className="pointer-events-none absolute bottom-full right-0 mb-3 whitespace-nowrap rounded-lg bg-[#173A5D] px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100">
        {label}
      </div>
    </div>
  )
}
