'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { WindowState } from './types'
import { buildInitialWindowStates } from './windowConfig'
import Window from './Window'
import Dock from './Dock'
import TeamleadersConsole from './TeamleadersConsole'
import AgentsConsole from './AgentsConsole'
import ManagementConsole from './ManagementConsole'
import type { ManagementConsoleProps } from './ManagementConsole'
import TeamLeaderOverviewConsole from './TeamLeaderOverviewConsole'
import VolumesConsole from '@/components/home/VolumesConsole'
import { DashboardContentProps, AgentConsoleData } from '@/components/dashboard/DashboardContent'
import { TeamLeaderConsoleData } from '@/types'
import { VolumeSeries } from '@/lib/home/volumes'
import { loadWindowGeometry, saveWindowGeometry } from '@/lib/console/windowPersistence'

export interface ConsoleDesktopProps {
  role: 'admin' | 'management'
  dashboardData: DashboardContentProps
  managementData?: ManagementConsoleProps
  teamLeaderConsoles?: TeamLeaderConsoleData[]
  agentConsoleData?: AgentConsoleData[]
  volumesData?: VolumeSeries[]
}

// Keep at least this much width and the full title bar height reachable within the
// desktop bounds, matching the drag-clamp rule in Window.tsx.
const MIN_REACHABLE_WIDTH = 120
const MIN_REACHABLE_HEIGHT = 48

export default function ConsoleDesktop({ role, dashboardData, managementData, teamLeaderConsoles, agentConsoleData, volumesData }: ConsoleDesktopProps) {
  const [windows, setWindows] = useState<WindowState[]>(() => buildInitialWindowStates(role))
  const [bounds, setBounds] = useState({ width: 0, height: 0 })
  const desktopRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useLayoutEffect(() => {
    const node = desktopRef.current
    if (!node) return

    // The Dock (z-50, see Dock.tsx) always paints on top of windows, so a window clamped
    // merely to the container's bottom edge could still land with its whole title bar
    // underneath the Dock — reachable "within the container" but not actually clickable.
    // Measuring the Dock's own height and excluding it from the usable vertical space keeps
    // the title bar clear of the Dock entirely, not just clear of the container edge.
    function measure() {
      if (!node) return { width: 0, height: 0 }
      const dockHeight = dockRef.current?.clientHeight ?? 0
      return { width: node.clientWidth, height: Math.max(0, node.clientHeight - dockHeight) }
    }

    const initial = measure()
    setBounds(initial)

    // One-time restore of any previously-saved geometry (localStorage isn't available
    // during SSR, so this can't happen in buildInitialWindowStates without causing a
    // hydration mismatch — doing it here, in a layout effect that runs before paint,
    // means the very first painted frame already reflects it, no visible flash) plus
    // the pre-existing correction of hardcoded default positions that would otherwise
    // fall outside a normal viewport's actual measured bounds. Intentionally mount-only
    // — re-running this whenever `windows` changes would fight the user's own drags
    // every time state updates.
    const saved = loadWindowGeometry()
    setWindows(prev =>
      prev.map(w => {
        const g = saved[w.id]
        const width = g?.width ?? w.width
        const height = g?.height ?? w.height
        const x = g?.x ?? w.x
        const y = g?.y ?? w.y
        return {
          ...w,
          width,
          height,
          x: Math.min(x, Math.max(0, initial.width - MIN_REACHABLE_WIDTH)),
          y: Math.min(y, Math.max(0, initial.height - MIN_REACHABLE_HEIGHT)),
        }
      }),
    )

    function handleResize() {
      setBounds(measure())
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  function updateWindow(id: string, patch: Partial<WindowState>) {
    setWindows(prev => prev.map(w => (w.id === id ? { ...w, ...patch } : w)))

    const touchesGeometry = 'x' in patch || 'y' in patch || 'width' in patch || 'height' in patch
    if (!touchesGeometry) return

    // Debounce the localStorage WRITE specifically (state above still updates
    // immediately, for a responsive drag/resize) — a gesture fires this on every
    // pointermove, and synchronous localStorage writes on every frame would be
    // wasteful and could jank the gesture itself.
    const current = windows.find(w => w.id === id)
    if (!current) return
    const merged = { ...current, ...patch }
    clearTimeout(saveTimers.current[id])
    saveTimers.current[id] = setTimeout(() => {
      saveWindowGeometry(id, { x: merged.x, y: merged.y, width: merged.width, height: merged.height })
    }, 300)
  }

  function focusWindow(id: string) {
    setWindows(prev => {
      const maxZ = Math.max(...prev.map(w => w.zIndex))
      return prev.map(w => (w.id === id ? { ...w, zIndex: maxZ + 1 } : w))
    })
  }

  function setStatus(id: string, status: WindowState['status']) {
    updateWindow(id, { status })
    if (status === 'open') focusWindow(id)
  }

  function renderConsole(w: WindowState) {
    switch (w.kind) {
      case 'teamleader':
        return <TeamleadersConsole {...dashboardData} />
      case 'agents':
        return <AgentsConsole agents={agentConsoleData ?? []} />
      case 'management':
        return managementData ? <ManagementConsole {...managementData} /> : null
      case 'teamleader-overview':
        return <TeamLeaderOverviewConsole consoles={teamLeaderConsoles ?? []} />
      case 'volumes':
        return <VolumesConsole series={volumesData ?? []} />
    }
  }

  return (
    <div ref={desktopRef} className="relative h-full w-full overflow-hidden bg-gray-50 dark:bg-gray-950">
      {windows
        .filter(w => w.status === 'open')
        .map(w => (
          <Window
            key={w.id}
            state={w}
            bounds={bounds}
            onDrag={(x, y) => updateWindow(w.id, { x, y })}
            onResize={patch => updateWindow(w.id, patch)}
            onFocus={() => focusWindow(w.id)}
            onMinimize={() => setStatus(w.id, 'minimized')}
            onClose={() => setStatus(w.id, 'closed')}
          >
            {renderConsole(w)}
          </Window>
        ))}
      <Dock ref={dockRef} windows={windows} onIconClick={id => setStatus(id, 'open')} />
    </div>
  )
}
