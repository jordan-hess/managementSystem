'use client'

import { useEffect, useState } from 'react'

const TYPE_SPEED_MS = 40

interface Props {
  /** Today's quote from lib/quotes.ts — see getQuoteOfTheDay(). */
  text: string
  author: string
}

// Merged into the Home page's greeting hero (no longer its own bordered
// card) — renders directly under Greeting.tsx, sharing its left column.
export default function WordOfTheDay({ text, author }: Props) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    let i = 0
    const timer = setInterval(() => {
      i += 1
      setTyped(text.slice(0, i))
      if (i >= text.length) clearInterval(timer)
    }, TYPE_SPEED_MS)
    return () => clearInterval(timer)
  }, [text])

  return (
    <div className="max-w-[46ch] animate-hero-in [animation-delay:200ms] motion-reduce:animate-none">
      <div aria-hidden className="h-0.5 bg-blue-500 mb-4 mt-5 animate-rule-in motion-reduce:w-10 motion-reduce:animate-none" />

      {/* Fixed min-height so the column doesn't jump as characters type in. */}
      <p className="text-lg xl:text-xl font-medium italic leading-snug text-white/90 min-h-[3.25rem] break-words [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]">
        &ldquo;{typed}
        {typed.length === text.length && <>&rdquo;</>}
        <span aria-hidden className="inline-block w-0.5 h-5 align-middle ml-0.5 bg-blue-500 animate-caret motion-reduce:animate-none" />
      </p>
      <p className="mt-2 text-xs text-white/60">&mdash; {author}</p>
    </div>
  )
}
