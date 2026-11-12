'use client'

import { forwardRef } from 'react'
import { LayoutDashboard, Users, Building2, Users2, BarChart3 } from 'lucide-react'
import { ConsoleKind, WindowState } from './types'

const ICONS: Record<ConsoleKind, typeof LayoutDashboard> = {
  teamleader: LayoutDashboard,
  agents: Users,
  management: Building2,
  'teamleader-overview': Users2,
  volumes: BarChart3,
}

export interface DockProps {
  windows: WindowState[]
  onIconClick: (id: string) => void
}

const Dock = forwardRef<HTMLDivElement, DockProps>(function Dock({ windows, onIconClick }, ref) {
  return (
    <div
      ref={ref}
      className="absolute bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-3 bg-gray-900/95 dark:bg-black/60 border-t border-gray-800 backdrop-blur"
    >
      {windows.map(w => {
        const Icon = ICONS[w.kind]
        const isOpen = w.status === 'open'
        const isMinimized = w.status === 'minimized'
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => onIconClick(w.id)}
            aria-label={`Open ${w.title}`}
            title={`Open ${w.title}`}
            className={`relative flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
              isOpen ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{w.title}</span>
            {(isOpen || isMinimized) && (
              <span className={`absolute -bottom-0.5 w-1 h-1 rounded-full ${isOpen ? 'bg-blue-400' : 'bg-gray-500'}`} />
            )}
          </button>
        )
      })}
    </div>
  )
})

export default Dock
