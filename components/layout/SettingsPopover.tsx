'use client'

import { useState } from 'react'
import { Wrench } from 'lucide-react'
import ThemeToggle from '@/components/ui/ThemeToggle'
import PatchNotesModal from '@/components/ui/PatchNotesModal'

export default function SettingsPopover() {
  const [open, setOpen] = useState(false)
  const [patchNotesOpen, setPatchNotesOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Open preferences"
        className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
      >
        <Wrench className="w-5 h-5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-20 overflow-hidden p-1.5">
            <p className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Preferences</p>
            <ThemeToggle />
            <button
              onClick={() => { setPatchNotesOpen(true); setOpen(false) }}
              title="View patch notes"
              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            >
              Patch notes &middot; v0.5.0
            </button>
          </div>
        </>
      )}

      <PatchNotesModal open={patchNotesOpen} onClose={() => setPatchNotesOpen(false)} />
    </div>
  )
}
