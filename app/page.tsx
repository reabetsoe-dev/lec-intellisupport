import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

import { LandingReveal } from "@/components/landing/LandingReveal"

export const metadata: Metadata = {
  title: "LEC IntelliSupport",
  description: "Smarter IT service management for Lesotho Electricity Company.",
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3 md:gap-4">
      <Image
        src="/logo2.jpg"
        alt="LEC logo"
        width={56}
        height={56}
        className="h-10 w-10 rounded-full border border-white/30 object-cover shadow-[0_10px_24px_rgba(6,20,63,0.42)] md:h-12 md:w-12"
        priority
      />
      <span className="landing-display text-[18px] font-semibold tracking-[-0.015em] text-white md:text-[20px]">LEC IntelliSupport</span>
    </div>
  )
}

export default function Home() {
  return (
    <main className="landing-copy flex h-[100dvh] flex-col overflow-hidden bg-[#f5f8fd] text-[#14255d]">
      <section className="relative min-h-0 flex-1 overflow-hidden text-white">
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
        <div className="absolute inset-x-0 top-[76px] h-px bg-white/20 md:top-[84px]" />
        <div className="landing-energy-line absolute left-[24%] right-0 top-[75px] h-[3px] opacity-80 md:top-[83px]" />
        <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-[#f5f8fd]/60" />

        <div className="relative mx-auto flex h-full w-full max-w-[1240px] flex-col px-5 md:px-8">
          <header className="flex shrink-0 items-center justify-between gap-4 py-4 md:py-5">
            <BrandMark />

            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center rounded-[12px] bg-[#f3162d] px-4 text-[14px] font-semibold text-white shadow-[0_14px_28px_rgba(243,22,45,0.28)] transition hover:bg-[#d61126] md:h-11 md:px-5 md:text-[15px]"
            >
              Get Started
            </Link>
          </header>

          <div className="flex min-h-0 flex-1 items-center py-4 md:py-5">
            <LandingReveal variant="left" className="max-w-[760px]">
              <h1 className="landing-display text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-white md:text-[40px] lg:text-[50px] xl:text-[56px]">
                Smarter IT Service Management for Lesotho Electricity Company
              </h1>

              <p className="mt-5 max-w-[580px] text-[15px] leading-[1.45] text-white/88 md:text-[17px] lg:text-[19px]">
                AI-powered tools to help LEC resolve incidents faster, keep teams aligned, and improve reliability across utility operations.
              </p>

            </LandingReveal>
          </div>
        </div>
      </section>

      <footer id="contact" className="shrink-0 border-t border-[#d7e2f4] bg-white py-4 md:py-5">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3 px-5 md:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo2.jpg"
              alt="LEC logo"
              width={36}
              height={36}
              className="h-8 w-8 rounded-full object-cover shadow-[0_6px_14px_rgba(10,25,67,0.2)]"
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
