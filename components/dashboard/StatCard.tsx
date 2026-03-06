import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type StatCardProps = {
  title: string
  value: string
  trend: string
  trendUp?: boolean
}

export function StatCard({ title, value, trend, trendUp = true }: StatCardProps) {
  return (
    <Card className="gap-0 rounded-lg border-slate-200 bg-white py-0 shadow-sm">
      <CardContent className="p-6">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
        <div className="mt-4 flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium",
              trendUp ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            )}
          >
            {trendUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {trend}
          </span>
          <span className="text-slate-500">vs previous period</span>
        </div>
      </CardContent>
    </Card>
  )
}
