import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const monthlyVolume = [
  { month: "Jan", value: 132 },
  { month: "Feb", value: 116 },
  { month: "Mar", value: 149 },
  { month: "Apr", value: 125 },
  { month: "May", value: 168 },
  { month: "Jun", value: 154 },
  { month: "Jul", value: 178 },
  { month: "Aug", value: 166 },
]

export function TicketVolumeChart() {
  const maxValue = Math.max(...monthlyVolume.map((item) => item.value))

  return (
    <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="px-6 py-5">
        <CardTitle className="text-base font-semibold text-slate-900">Ticket Volume Trend</CardTitle>
        <p className="text-sm text-slate-500">Monthly ticket inflow and operational load</p>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3 text-xs text-slate-400">
            <span>200</span>
            <span>150</span>
            <span>100</span>
            <span>50</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex h-64 items-end gap-3">
              {monthlyVolume.map((item) => (
                <div key={item.month} className="flex flex-1 flex-col items-center gap-3">
                  <div
                    className="w-full rounded-md bg-slate-700/90 transition-opacity hover:opacity-80"
                    style={{ height: `${(item.value / maxValue) * 220}px` }}
                  />
                  <span className="text-xs font-medium text-slate-500">{item.month}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
