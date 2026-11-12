'use client'

import { useEffect, useRef, type ReactNode } from 'react'

type Props = {
  open: boolean
  labelledBy: string
  onCancel: () => void
  children: ReactNode
}

// Shared shell for the board's dialogs. A native modal <dialog> gives the
// focus trap and the inert background; children only mount while open so a
// reopened dialog starts fresh.
export default function ModalDialog({ open, labelledBy, onCancel, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
      // A confirmed move can unmount the opener (e.g. a Place button); the
      // board then focuses the moved card itself. Otherwise fall back to the
      // selected card, if there is one.
      const target = opener.current?.isConnected
        ? opener.current
        : document.querySelector<HTMLElement>('[data-agent-id][aria-pressed="true"]')
      target?.focus()
      opener.current = null
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      // Esc: let the parent decide, rather than the browser closing it first.
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/50 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
    >
      {open && children}
    </dialog>
  )
}
