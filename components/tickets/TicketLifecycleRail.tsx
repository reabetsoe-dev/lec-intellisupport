"use client"

import { CheckCircle2, Circle, LoaderCircle, PauseCircle } from "lucide-react"

import { cn } from "@/lib/utils"

type TicketLifecycleRailProps = {
  status: string
  waitingFor?: string
  className?: string
  onStepClick?: (step: (typeof LIFECYCLE_STEPS)[number]) => void
  getStepActionLabel?: (step: (typeof LIFECYCLE_STEPS)[number]) => string | null
}

const LIFECYCLE_STEPS = ["Pending", "In Progress", "Pending Review", "Solved"] as const

function normalizeStatus(status: string): (typeof LIFECYCLE_STEPS)[number] {
  const normalized = status.trim().toLowerCase()
  if (normalized === "open" || normalized === "pending vendor" || normalized === "pending") {
    return "Pending"
  }
  if (normalized === "escalated" || normalized === "in progress" || normalized === "in process") {
    return "In Progress"
  }
  if (normalized === "pending review" || normalized === "awaiting review") {
    return "Pending Review"
  }
  return "Solved"
}

function stepIcon(step: (typeof LIFECYCLE_STEPS)[number], isCurrent: boolean, isDone: boolean) {
  if (isDone) {
    return CheckCircle2
  }
  if (isCurrent && step === "In Progress") {
    return LoaderCircle
  }
  if (isCurrent && step === "Pending Review") {
    return PauseCircle
  }
  return Circle
}

export function TicketLifecycleRail({
  status,
  waitingFor,
  className,
  onStepClick,
  getStepActionLabel,
}: TicketLifecycleRailProps) {
  const normalizedStatus = normalizeStatus(status)
  const currentIndex = LIFECYCLE_STEPS.indexOf(normalizedStatus)

  return (
    <div className={cn("rounded-xl border border-[#D7E4F0] bg-white p-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {LIFECYCLE_STEPS.map((step, index) => {
          const isCurrent = currentIndex === index
          const isDone = index < currentIndex
          const Icon = stepIcon(step, isCurrent, isDone)
          const actionLabel = getStepActionLabel?.(step) ?? null
          const isClickable = Boolean(onStepClick && actionLabel)
          return (
            <div key={step} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onStepClick && isClickable) {
                    onStepClick(step)
                  }
                }}
                disabled={!isClickable}
                title={actionLabel ?? undefined}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold",
                  isClickable ? "cursor-pointer hover:brightness-95" : "cursor-default",
                  isDone
                    ? "border-[#9AD0B1] bg-[#EAF8F0] text-[#1E6A40]"
                    : isCurrent
                      ? "border-[#D9BC7D] bg-[#FFF6E4] text-[#8A5A00]"
                      : "border-[#C9D8E7] bg-[#F4F8FC] text-[#5A7CA0]"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", isCurrent && step === "In Progress" ? "animate-spin" : "")} />
                {step}
                {actionLabel ? <span className="ml-1 text-[10px] font-medium">({actionLabel})</span> : null}
              </button>
              {index < LIFECYCLE_STEPS.length - 1 ? <span className="text-[#8AA3BD]">{"->"}</span> : null}
            </div>
          )
        })}
      </div>
      {waitingFor ? (
        <p className="mt-2 text-xs font-medium text-[#7A5700]">Waiting for: {waitingFor}</p>
      ) : null}
    </div>
  )
}
