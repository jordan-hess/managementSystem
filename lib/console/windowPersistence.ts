const STORAGE_KEY = 'console-window-geometry'

export interface WindowGeometry {
  x: number
  y: number
  width: number
  height: number
}

/** Reads all saved window geometry, keyed by window id. Never throws. */
export function loadWindowGeometry(): Record<string, WindowGeometry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Persists one window's geometry, merging into whatever's already saved. Never throws. */
export function saveWindowGeometry(id: string, geometry: WindowGeometry) {
  try {
    const all = loadWindowGeometry()
    all[id] = geometry
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // localStorage unavailable (privacy mode, quota) — silently ignore, matching
    // the existing convention in components/ui/ThemeToggle.tsx.
  }
}
