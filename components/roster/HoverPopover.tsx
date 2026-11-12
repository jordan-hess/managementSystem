'use client'

import { useRef, useState, type ReactNode } from 'react'

interface Props {
  trigger: ReactNode
  children: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}

const ALIGN_CLASS: Record<NonNullable<Props['align']>, string> = {
  left: 'left-0',
  right: 'right-0',
  center: 'left-1/2 -translate-x-1/2',
}

/**
 * Hover-triggered popover — generalizes the two hand-rolled patterns already
 * in this codebase (SettingsPopover.tsx's click-toggle, MyQueueWidget.tsx's
 * ref+outside-click) into one reusable primitive, since neither precedent
 * is hover-triggered. Keyboard-focusable so content isn't hover-only.
 */
export default function HoverPopover({ trigger, children, align = 'center', className }: Props) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function show() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    setOpen(true)
  }

  function scheduleHide() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    // Short delay so moving the pointer from the trigger into the popover
    // body itself doesn't instantly close it.
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="relative inline-block" onMouseEnter={show} onMouseLeave={scheduleHide}>
      <div tabIndex={0} onFocus={show} onBlur={scheduleHide} onKeyDown={onKeyDown} className="outline-none">
        {trigger}
      </div>

      {open && (
        <div
          className={`absolute top-full mt-2 z-30 w-64 max-h-64 overflow-y-auto shadow-lg border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 p-3 ${ALIGN_CLASS[align]} ${className ?? ''}`}
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
        >
          {children}
        </div>
      )}
    </div>
  )
}
