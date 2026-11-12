'use client'

import { useState, type ReactNode, type SyntheticEvent } from 'react'

interface Props {
  note: string
  children: ReactNode
}

const WIDTH = 224
const EDGE = 8

/**
 * Shows a roster override's note while its grid cell is hovered or focused.
 * Fixed-positioned rather than HoverPopover's absolute popup: the month grid
 * scrolls inside its own overflow box, which would clip an absolute popup on
 * the bottom rows and last columns. Flips above the cell near the viewport's
 * bottom edge.
 */
export default function OverrideNoteHover({ note, children }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null)

  function show(e: SyntheticEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const above = r.bottom + 120 > window.innerHeight
    const centre = r.left + r.width / 2
    const left = Math.min(Math.max(centre - WIDTH / 2, EDGE), window.innerWidth - WIDTH - EDGE)
    setPos({ top: above ? r.top - EDGE : r.bottom + EDGE, left, above })
  }

  const hide = () => setPos(null)

  return (
    <div onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos && (
        <div
          role="tooltip"
          style={{ top: pos.top, left: pos.left, width: WIDTH }}
          className={`fixed z-40 pointer-events-none whitespace-pre-wrap break-words text-left text-xs font-normal text-gray-700 dark:text-gray-200 shadow-lg border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 p-3 ${pos.above ? '-translate-y-full' : ''}`}
        >
          {note}
        </div>
      )}
    </div>
  )
}
