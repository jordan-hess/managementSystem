import { WindowConfig, WindowState } from './types'

export function getWindowConfigs(role: 'admin' | 'management'): WindowConfig[] {
  if (role === 'management') {
    return [
      { id: 'teamleaders-overview', kind: 'teamleader-overview', title: 'Team Leaders', defaultX: 40, defaultY: 32, defaultWidth: 900, defaultHeight: 640, entryDelayMs: 0 },
      { id: 'management', kind: 'management', title: 'Management', defaultX: 960, defaultY: 32, defaultWidth: 480, defaultHeight: 360, entryDelayMs: 80 },
      { id: 'volumes', kind: 'volumes', title: 'Volumes', defaultX: 960, defaultY: 420, defaultWidth: 480, defaultHeight: 400, entryDelayMs: 120 },
    ]
  }

  return [
    { id: 'teamleader-1', kind: 'teamleader', title: 'Teamleaders', defaultX: 40, defaultY: 32, defaultWidth: 560, defaultHeight: 420, entryDelayMs: 0 },
    { id: 'teamleader-2', kind: 'teamleader', title: 'Teamleaders', defaultX: 620, defaultY: 32, defaultWidth: 560, defaultHeight: 420, entryDelayMs: 40 },
    { id: 'agents-1', kind: 'agents', title: 'Agents', defaultX: 40, defaultY: 480, defaultWidth: 400, defaultHeight: 320, entryDelayMs: 80 },
    { id: 'agents-2', kind: 'agents', title: 'Agents', defaultX: 460, defaultY: 480, defaultWidth: 400, defaultHeight: 320, entryDelayMs: 120 },
    { id: 'volumes', kind: 'volumes', title: 'Volumes', defaultX: 880, defaultY: 32, defaultWidth: 520, defaultHeight: 420, entryDelayMs: 160 },
  ]
}

export function buildInitialWindowStates(role: 'admin' | 'management'): WindowState[] {
  return getWindowConfigs(role).map((config, index) => ({
    ...config,
    x: config.defaultX,
    y: config.defaultY,
    width: config.defaultWidth,
    height: config.defaultHeight,
    zIndex: index + 1,
    status: 'open' as const,
  }))
}
