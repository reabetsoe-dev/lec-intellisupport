import type { CSSProperties } from "react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { BarChart3, BookOpenText, Bot, Gauge, LayoutDashboard, Ticket, type LucideIcon, Workflow } from "lucide-react"

import { LandingReveal } from "@/components/landing/LandingReveal"

export const metadata: Metadata = {
  title: "LEC IntelliSupport",
  description: "Smarter IT service management for Lesotho Electricity Company.",
}

const sectionTitleClass =
  "landing-display text-[26px] md:text-[32px] lg:text-[40px] font-bold leading-[1.12] tracking-[-0.02em] text-[#12275f]"
const sectionSubtitleClass = "mx-auto mt-4 max-w-3xl text-[18px] leading-[1.6] text-[#5f7196]"

const featureCards: Array<{
  title: string
  description: string
  icon: LucideIcon
  iconClassName: string
}> = [
  {
    title: "Automated Ticketing",
    description: "Prioritize and assign faults automatically using configurable routing logic.",
    icon: Ticket,
    iconClassName: "bg-[linear-gradient(135deg,#f3162d_0%,#c91124_100%)]",
  },
  {
    title: "AI Insights",
    description: "Surface recurring outage patterns and actionable operational recommendations.",
    icon: BarChart3,
    iconClassName: "bg-[linear-gradient(135deg,#0f1f5c_0%,#005fcc_100%)]",
  },
  {
    title: "24/7 Virtual Agent",
    description: "Provide always-on guidance for staff and customers during critical incidents.",
    icon: Bot,
    iconClassName: "bg-[linear-gradient(135deg,#005fcc_0%,#2f8dff_100%)]",
  },
] as const

const solutionCards: Array<{
  title: string
  description: string
  icon: LucideIcon
  iconClassName: string
}> = [
  {
    title: "Real-Time Dashboard",
    description: "Monitor system health and fault queues in one executive view.",
    icon: LayoutDashboard,
    iconClassName: "bg-[#005fcc]",
  },
  {
    title: "SLA Management",
    description: "Track response windows and escalations with timeline visibility.",
    icon: Gauge,
    iconClassName: "bg-[#11225a]",
  },
  {
    title: "Knowledge Base",
    description: "Preserve proven fixes and institutional knowledge for faster resolution.",
    icon: BookOpenText,
    iconClassName: "bg-[#f3162d]",
  },
  {
    title: "Custom Workflows",
    description: "Adapt assignment and approval flows to utility operations.",
    icon: Workflow,
    iconClassName: "bg-[#005fcc]",
  },
] as const

const powerBackdropStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(242,246,252,0.94) 100%), url('/power-infrastructure.jpg')",
  backgroundSize: "cover",
  backgroundPosition: "center",
}

const demoBackdropStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(239,244,251,0.92) 100%), url('/power-infrastructure.jpg')",
  backgroundSize: "cover",
  backgroundPosition: "center bottom",
}

function BrandMark() {
  return (
    <div className="flex items-center gap-4">
      <Image
        src="/logo2.jpg"
        alt="LEC logo"
        width={56}
        height={56}
        className="h-12 w-12 rounded-full border border-white/30 object-cover shadow-[0_10px_24px_rgba(6,20,63,0.42)] md:h-14 md:w-14"
        priority
      />
      <span className="landing-display text-[20px] font-semibold tracking-[-0.015em] text-white md:text-[22px]">LEC IntelliSupport</span>
    </div>
  )
}

function HeroLaptop() {
  const bars = [
    { height: "34%", color: "bg-[#005fcc]" },
    { height: "42%", color: "bg-[#2f8dff]" },
    { height: "54%", color: "bg-[#11225a]" },
    { height: "74%", color: "bg-[#f3162d]" },
    { height: "46%", color: "bg-[#005fcc]" },
    { height: "64%", color: "bg-[#f3162d]" },
    { height: "48%", color: "bg-[#1c3275]" },
    { height: "39%", color: "bg-[#2f8dff]" },
  ] as const

  return (
    <div className="relative mx-auto w-full max-w-[620px]">
      <div className="landing-float-fast absolute -right-3 top-[18%] z-20 hidden rounded-2xl border border-[#d6e0f3] bg-white/95 p-3 shadow-[0_18px_38px_rgba(10,26,66,0.2)] md:block">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#f3162d_0%,#005fcc_100%)] text-white">
          <Bot className="h-6 w-6" />
        </div>
      </div>

      <div className="relative pt-4">
        <div className="landing-monitor-shell rounded-[26px] p-3">
          <div className="overflow-hidden rounded-[18px] border border-[#dfe6f2] bg-[#f8fbff]">
            <div className="flex items-center justify-between border-b border-[#e6ebf4] bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#f3162d]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#005fcc]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#d3dbe9]" />
              </div>
              <div className="h-2 w-32 rounded-full bg-[#edf1f8]" />
            </div>

            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { label: "Ticket", value: "Queue", icon: Ticket },
                  { label: "SLA", value: "Alerts", icon: Gauge },
                  { label: "Support", value: "Teams", icon: LayoutDashboard },
                  { label: "Insights", value: "Reports", icon: BarChart3 },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="landing-surface rounded-2xl p-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#edf3ff] text-[#005fcc]">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-[11px] font-medium text-[#8b98b5]">{item.label}</p>
                          <p className="text-sm font-semibold text-[#14255d]">{item.value}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
                <div className="landing-surface rounded-[18px] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#95a3be]">Live Dashboard</p>
                    <span className="h-2 w-2 rounded-full bg-[#f3162d]" />
                  </div>
                  <div className="mt-4 grid h-40 grid-cols-8 items-end gap-2 rounded-[16px] border border-[#edf1f7] bg-[linear-gradient(180deg,#fbfdff_0%,#f4f7fc_100%)] px-3 pb-4 pt-6">
                    {bars.map((bar, index) => (
                      <div key={`${bar.height}-${index}`} className="flex h-full items-end">
                        <div className={`w-full rounded-t-[8px] ${bar.color}`} style={{ height: bar.height }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="landing-surface rounded-[18px] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#95a3be]">Team Efficiency</p>
                    <span className="h-2 w-2 rounded-full bg-[#005fcc]" />
                  </div>
                  <div className="mt-5 flex items-center gap-4">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[conic-gradient(#f3162d_0_28%,#005fcc_28%_58%,#11225a_58%_82%,#d8e3f6_82%_100%)] p-4">
                      <div className="h-full w-full rounded-full bg-white" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="h-2 rounded-full bg-[#eef2f8]" />
                      <div className="h-2 w-[86%] rounded-full bg-[#eef2f8]" />
                      <div className="h-2 w-[72%] rounded-full bg-[#eef2f8]" />
                      <div className="h-2 w-[64%] rounded-full bg-[#eef2f8]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="landing-laptop-base absolute bottom-1 left-1/2 h-[18px] w-[112%] -translate-x-1/2 rounded-b-[999px]" />
        <div className="absolute bottom-0 left-1/2 h-[8px] w-28 -translate-x-1/2 rounded-b-[999px] bg-[#9aa9c2]" />
      </div>
    </div>
  )
}

function DemoLaptop() {
  const rows = [
    { label: "Dashboard", badge: "High", badgeClassName: "bg-[#fee9ec] text-[#cf1128]" },
    { label: "Discussions", badge: "Low", badgeClassName: "bg-[#edf3ff] text-[#005fcc]" },
    { label: "Monitoring", badge: "High", badgeClassName: "bg-[#fee9ec] text-[#cf1128]" },
    { label: "Assets", badge: "Low", badgeClassName: "bg-[#edf3ff] text-[#005fcc]" },
    { label: "Knowledge", badge: "Mid", badgeClassName: "bg-[#eef1f6] text-[#14255d]" },
  ] as const

  return (
    <div className="relative mx-auto w-full max-w-[540px] pb-8">
      <div className="landing-monitor-shell rounded-[24px] p-3">
        <div className="overflow-hidden rounded-[18px] bg-white">
          <div className="flex items-center justify-between bg-[#101c56] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#f3162d]" />
              <span className="h-2 w-2 rounded-full bg-[#2f8dff]" />
              <span className="h-2 w-2 rounded-full bg-[#d3dbe9]" />
            </div>
            <div className="h-2 w-32 rounded-full bg-white/10" />
          </div>

          <div className="space-y-4 bg-[linear-gradient(180deg,#fbfcff_0%,#f4f7fc_100%)] p-4">
            <div className="flex items-center gap-3">
              <div className="h-7 w-24 rounded-full bg-[#f3162d]" />
              <div className="h-7 w-20 rounded-full bg-[#edf2fa]" />
              <div className="h-7 w-16 rounded-full bg-[#edf2fa]" />
            </div>

            <div className="overflow-hidden rounded-[14px] border border-[#e7edf7] bg-white">
              <div className="grid grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr] gap-4 border-b border-[#edf2f8] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#98a4bc]">
                <span>Name</span>
                <span>Assigned</span>
                <span>Status</span>
                <span>Priority</span>
              </div>

              <div className="divide-y divide-[#edf2f8]">
                {rows.map((row) => (
                  <div key={row.label} className="grid grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr] gap-4 px-4 py-3 text-sm text-[#14255d]">
                    <span className="font-medium">{row.label}</span>
                    <span className="text-[#7f8ba4]">Support team</span>
                    <span className="text-[#7f8ba4]">Active</span>
                    <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${row.badgeClassName}`}>{row.badge}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="landing-laptop-base absolute bottom-1 left-1/2 h-[16px] w-[112%] -translate-x-1/2 rounded-b-[999px]" />
      <div className="absolute bottom-0 left-1/2 h-[8px] w-28 -translate-x-1/2 rounded-b-[999px] bg-[#9aa9c2]" />
    </div>
  )
}

function SectionEnergyBackdrop({ style }: { style: CSSProperties }) {
  return (
    <>
      <div className="absolute inset-0 opacity-[0.45]" style={style} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(46,134,255,0.13)_0%,rgba(46,134,255,0)_30%),radial-gradient(circle_at_12%_74%,rgba(243,22,45,0.11)_0%,rgba(243,22,45,0)_28%)]" />
      <div className="landing-light-wave absolute left-0 right-0 top-[16%] h-14 opacity-55" />
      <div className="landing-light-wave absolute bottom-[10%] left-[-10%] right-[-10%] h-16 opacity-45" />
    </>
  )
}

export default function Home() {
  return (
    <main className="landing-copy overflow-x-hidden bg-[#f5f8fd] text-[#14255d]">
      <section className="relative overflow-hidden text-white">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(112deg, rgba(5,12,36,0.94) 0%, rgba(10,24,72,0.88) 38%, rgba(10,40,110,0.66) 72%, rgba(243,22,45,0.2) 100%), url('/power-infrastructure.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="landing-hero-fade absolute inset-0" />
        <div className="absolute inset-x-0 top-[94px] h-px bg-white/20" />
        <div className="landing-energy-line absolute left-[24%] right-0 top-[93px] h-[3px] opacity-80" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[#f5f8fd]" />

        <div className="relative mx-auto w-full max-w-[1240px] px-5 md:px-8">
          <header className="flex items-center justify-between gap-4 py-6 md:py-7">
            <BrandMark />

            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-[12px] bg-[#f3162d] px-5 text-[15px] font-semibold text-white shadow-[0_14px_28px_rgba(243,22,45,0.28)] transition hover:bg-[#d61126] md:h-12 md:px-6 md:text-[16px]"
            >
              Get Started
            </Link>
          </header>

          <div className="grid items-center gap-12 pb-16 pt-8 md:gap-14 md:pb-20 md:pt-10 lg:grid-cols-[1fr_1.02fr] lg:gap-16 lg:pb-24 lg:pt-12">
            <LandingReveal variant="left" className="max-w-[620px]">
              <h1 className="landing-display text-[34px] font-bold leading-[1.1] tracking-[-0.03em] text-white md:text-[44px] lg:text-[60px]">
                Smarter IT Service Management for Lesotho Electricity Company
              </h1>

              <p className="mt-6 max-w-[580px] text-[16px] leading-[1.5] text-white/88 md:text-[18px] lg:text-[20px]">
                AI-powered tools to help LEC resolve incidents faster, keep teams aligned, and improve reliability across utility operations.
              </p>

            </LandingReveal>

            <LandingReveal variant="right" delay={120}>
              <HeroLaptop />
            </LandingReveal>
          </div>
        </div>
      </section>

      <section id="features" className="relative overflow-hidden py-16 md:py-20 lg:py-24">
        <SectionEnergyBackdrop style={powerBackdropStyle} />

        <div className="relative mx-auto w-full max-w-[1240px] px-5 md:px-8">
          <LandingReveal className="text-center">
            <h2 className={sectionTitleClass}>Transform Your IT Support Operations</h2>
            <p className={sectionSubtitleClass}>Empowering your teams with dependable, intelligent service workflows.</p>
          </LandingReveal>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {featureCards.map((card, index) => {
              const Icon = card.icon

              return (
                <LandingReveal key={card.title} delay={index * 110}>
                  <article className="landing-surface landing-card-shadow landing-hover-card rounded-2xl px-7 py-8 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[16px] text-white shadow-[0_14px_26px_rgba(16,28,86,0.16)]">
                      <span className={`flex h-16 w-16 items-center justify-center rounded-[16px] ${card.iconClassName}`}>
                        <Icon className="h-7 w-7" />
                      </span>
                    </div>
                    <h3 className="landing-display mt-6 text-[24px] font-semibold leading-[1.25] tracking-[-0.02em] text-[#132a63]">{card.title}</h3>
                    <p className="mt-3 text-[17px] leading-[1.6] text-[#5f7196]">{card.description}</p>
                  </article>
                </LandingReveal>
              )
            })}
          </div>
        </div>
      </section>

      <section id="solutions" className="relative overflow-hidden border-y border-[#dbe6f6] py-16 md:py-20 lg:py-24">
        <SectionEnergyBackdrop style={powerBackdropStyle} />

        <div className="relative mx-auto w-full max-w-[1240px] px-5 md:px-8">
          <LandingReveal className="text-center">
            <h2 className={sectionTitleClass}>Built for Utility-Scale Service Teams</h2>
            <p className={sectionSubtitleClass}>Designed for accountability, fast decisions, and smooth cross-team execution.</p>
          </LandingReveal>

          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {solutionCards.map((card, index) => {
              const Icon = card.icon

              return (
                <LandingReveal key={card.title} delay={index * 95}>
                  <article className="landing-surface landing-card-shadow landing-hover-card flex h-full gap-4 rounded-[18px] px-5 py-6">
                    <span className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-white ${card.iconClassName}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="landing-display text-[22px] font-semibold leading-[1.25] tracking-[-0.02em] text-[#132a63]">{card.title}</h3>
                      <p className="mt-2 text-[16px] leading-[1.55] text-[#5f7196]">{card.description}</p>
                    </div>
                  </article>
                </LandingReveal>
              )
            })}
          </div>
        </div>
      </section>

      <section id="demo" className="relative overflow-hidden py-16 md:py-20 lg:py-24">
        <SectionEnergyBackdrop style={demoBackdropStyle} />

        <div className="relative mx-auto w-full max-w-[1240px] px-5 md:px-8">
          <LandingReveal className="text-center">
            <h2 className={sectionTitleClass}>See IntelliSupport in Action</h2>
            <p className={sectionSubtitleClass}>A clear operational view for administrators, supervisors, and support teams.</p>
          </LandingReveal>

          <div className="mt-14 grid items-center gap-10 lg:grid-cols-[1.02fr_0.98fr]">
            <LandingReveal variant="left" delay={80}>
              <DemoLaptop />
            </LandingReveal>

            <LandingReveal variant="right" delay={160}>
              <article className="landing-card-shadow landing-hover-card relative rounded-[22px] border border-[#e2e9f4] bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(244,248,253,0.97)_100%)] px-7 py-8 md:px-8 md:py-10">
                <p className="landing-display text-[26px] font-semibold leading-[1.45] tracking-[-0.02em] text-[#142b63] md:text-[30px]">
                  LEC IntelliSupport improved how we triage and resolve faults, with better team coordination and faster response times.
                </p>

                <div className="mt-8 flex items-center gap-4">
                  <div className="landing-soft-pulse flex h-16 w-16 items-center justify-center rounded-full bg-[linear-gradient(135deg,#fbd6dc_0%,#ffffff_56%,#d8e7ff_100%)] text-lg font-bold text-[#14255d] shadow-[0_12px_24px_rgba(16,28,86,0.14)]">
                    BM
                  </div>
                  <div>
                    <p className="landing-display text-[24px] font-semibold tracking-[-0.02em] text-[#14255d]">Boithatelo Motelle</p>
                    <p className="text-[18px] text-[#617198]">IT Manager</p>
                  </div>
                </div>
              </article>
            </LandingReveal>
          </div>
        </div>
      </section>

      <section id="pricing" className="relative overflow-hidden py-16 text-white md:py-20">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(8,20,58,0.94) 0%, rgba(12,26,78,0.92) 56%, rgba(0,95,204,0.78) 100%), url('/power-infrastructure.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center bottom",
          }}
        />
        <div className="landing-bottom-glow absolute inset-0" />

        <LandingReveal className="relative mx-auto w-full max-w-[1240px] px-5 md:px-8">
          <h2 className="landing-display text-center text-[26px] font-bold leading-[1.14] tracking-[-0.02em] text-white md:text-[32px] lg:text-[40px]">
            Enterprise-ready reliability for every support shift
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-center text-[18px] leading-[1.6] text-white/82">
            Secure workflows, role-based operations, and clear performance reporting for stakeholder confidence.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border border-white/16 bg-white/8 px-5 py-5 backdrop-blur-sm">
              <p className="text-sm uppercase tracking-[0.16em] text-white/66">Fault Visibility</p>
              <p className="mt-2 text-[22px] font-semibold">Real-time queue insights</p>
            </article>
            <article className="rounded-2xl border border-white/16 bg-white/8 px-5 py-5 backdrop-blur-sm">
              <p className="text-sm uppercase tracking-[0.16em] text-white/66">Operational Control</p>
              <p className="mt-2 text-[22px] font-semibold">SLA-aware prioritization</p>
            </article>
            <article className="rounded-2xl border border-white/16 bg-white/8 px-5 py-5 backdrop-blur-sm">
              <p className="text-sm uppercase tracking-[0.16em] text-white/66">Decision Support</p>
              <p className="mt-2 text-[22px] font-semibold">Data-backed improvements</p>
            </article>
          </div>
        </LandingReveal>
      </section>

      <footer id="contact" className="border-t border-[#d7e2f4] bg-white py-8 md:py-10">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-5 md:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo2.jpg"
              alt="LEC logo"
              width={36}
              height={36}
              className="h-9 w-9 rounded-full object-cover shadow-[0_6px_14px_rgba(10,25,67,0.2)]"
            />
            <span className="landing-display text-[18px] font-semibold tracking-[-0.015em] text-[#14275f]">LEC IntelliSupport</span>
          </div>

          <div className="flex flex-col gap-2 text-sm text-[#5f7196] md:flex-row md:items-center md:gap-6">
            <p className="font-medium text-[#14275f]">Call us now: <span className="text-[#cf1128]">+266 5210 0000</span></p>
            <p className="font-medium text-[#14275f]">WhatsApp: <span className="text-[#cf1128]">+266 6227 4000</span></p>
          </div>
        </div>
      </footer>
    </main>
  )
}
