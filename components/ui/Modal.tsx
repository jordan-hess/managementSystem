'use client'

import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'lg' | '2xl' | '4xl'
  /** false hides the close button and ignores backdrop clicks. */
  dismissible?: boolean
}

const SIZE_CLASS: Record<NonNullable<ModalProps['size']>, string> = {
  lg: 'max-w-lg',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
}

export default function Modal({ open, onClose, title, children, size = 'lg', dismissible = true }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={dismissible ? onClose : undefined} />
      <div className={`relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full ${SIZE_CLASS[size]} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          {dismissible && (
            <button onClick={onClose} title="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}
