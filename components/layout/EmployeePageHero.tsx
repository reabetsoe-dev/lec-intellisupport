type EmployeePageHeroProps = {
  title: string
  description: string
  compact?: boolean
}

export function EmployeePageHero({ title, description, compact = false }: EmployeePageHeroProps) {
  return (
    <section
      className={`rounded-2xl border border-[#0072CE]/30 bg-gradient-to-r from-[#0B1F3A] via-[#0E2B54] to-[#0072CE] px-6 text-white shadow-[0_12px_28px_rgba(11,31,58,0.2)] ${
        compact ? "py-4" : "py-6"
      }`}
    >
      <p className="text-xs font-semibold tracking-[0.2em] text-[#B9DBFF] uppercase">Lesotho Electricity Company</p>
      <h2 className={`mt-2 font-bold tracking-wide text-white ${compact ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl"}`}>
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-[#D8EAFF]">{description}</p>
    </section>
  )
}
