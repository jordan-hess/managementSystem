import { GreetingPeriod } from '@/lib/home/greeting'

interface GreetingProps {
  /** First name only (page.tsx derives this from profile.full_name) — null omits the name line entirely. */
  firstName: string | null
  period: GreetingPeriod
}

// Server component (no 'use client') — page.tsx already has profile.full_name
// and computes `period` server-side, so there's nothing here that needs the
// Header's client-fetch-after-mount pattern (which would flash an empty name).
export default function Greeting({ firstName, period }: GreetingProps) {
  return (
    <div className="relative">
      {/* Decorative falling-rain motif — sits inside the page's own left
          gutter padding (-left-7 = 28px, less than the px-16/64px gutter)
          so it adds zero layout width. */}
      <span
        aria-hidden
        className="pointer-events-none hidden lg:block absolute -left-7 top-1 h-40 w-4 overflow-hidden"
      >
        {/* motion-reduce:hidden lives on each drop (not the wrapper above) —
            put on the wrapper it would lose the CSS cascade to that same
            element's own `lg:block` whenever both media conditions are true
            (both are display-property variants on one class list; whichever
            is later in the compiled stylesheet wins). These children have no
            competing responsive variant, so motion-reduce:hidden always wins here. */}
        <span className="absolute left-0 top-0 w-px h-7 bg-linear-to-b from-transparent via-blue-500 to-transparent animate-raindrop [animation-duration:2.6s] motion-reduce:hidden" />
        <span className="absolute left-1.5 top-0 w-px h-5 bg-linear-to-b from-transparent via-blue-400/80 to-transparent animate-raindrop [animation-duration:3.6s] [animation-delay:0.8s] motion-reduce:hidden" />
        <span className="absolute left-3 top-0 w-px h-9 bg-linear-to-b from-transparent via-blue-500/70 to-transparent animate-raindrop [animation-duration:4.2s] [animation-delay:1.6s] motion-reduce:hidden" />
      </span>

      <h1 className="font-black tracking-tight leading-[0.92] [text-shadow:0_2px_24px_rgba(0,0,0,0.5)]">
        {firstName ? (
          <>
            <span className="block animate-hero-in motion-reduce:animate-none text-4xl xl:text-5xl [@media(max-height:760px)]:text-3xl">
              <span className="text-blue-500">Good</span>{' '}
              <span className="font-light text-white">{period},</span>
            </span>
            <span className="block text-white animate-hero-in [animation-delay:80ms] motion-reduce:animate-none text-5xl xl:text-6xl [@media(max-height:760px)]:text-4xl">
              {firstName}
            </span>
          </>
        ) : (
          <span className="block animate-hero-in motion-reduce:animate-none text-5xl xl:text-6xl [@media(max-height:760px)]:text-4xl">
            <span className="text-blue-500">Good</span>{' '}
            <span className="font-light text-white">{period}</span>
          </span>
        )}
      </h1>
    </div>
  )
}
