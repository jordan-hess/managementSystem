export type ConsoleKind = 'teamleader' | 'agents' | 'management' | 'teamleader-overview' | 'volumes'
export type WindowStatus = 'open' | 'minimized' | 'closed'

export interface WindowConfig {
  id: string
  kind: ConsoleKind
  title: string
  defaultX: number
  defaultY: number
  defaultWidth: number
  defaultHeight: number
  entryDelayMs: number
}

export interface WindowState extends WindowConfig {
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  status: WindowStatus
}
