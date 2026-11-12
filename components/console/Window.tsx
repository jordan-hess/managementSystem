'use client'

import { useEffect, useRef } from 'react'
import { Minus, X } from 'lucide-react'
import { animate } from 'animejs'
import { WindowState } from './types'

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'

export interface WindowProps {
  state: WindowState
  children: React.ReactNode
  onDrag: (x: number, y: number) => void
  onResize: (patch: { x: number; y: number; width: number; height: number }) => void
  onFocus: () => void
  onMinimize: () => void
  onClose: () => void
  bounds: { width: number; height: number }
}

const MIN_WIDTH = 320
const MIN_HEIGHT = 240

// Keep at least this much width and the full title bar height reachable within the
// desktop bounds, so a dragged window's title bar can never end up fully off-screen.
const MIN_REACHABLE_WIDTH = 120
const MIN_REACHABLE_HEIGHT = 48

interface ResizeOrigin {
  pointerX: number
  pointerY: number
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  corner: ResizeCorner
}

export default function Window({ state, children, onDrag, onResize, onFocus, onMinimize, onClose, bounds }: WindowProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(null)
  const resizeOrigin = useRef<ResizeOrigin | null>(null)

  useEffect(() => {
    const node = rootRef.current
    if (!node) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    animate(node, {
      opacity: [0, 1],
      scale: [0.9, 1],
      duration: 200,
      delay: state.entryDelayMs,
      ease: 'outQuad',
    })
    // Intentionally mount-only: every open/reopen of a window is a fresh mount of this
    // component (ConsoleDesktop only renders windows with status === 'open'), so re-running
    // this on prop changes would replay the entrance animation on every drag/resize update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function playExitAnimation(after: () => void) {
    const node = rootRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!node || reduceMotion) {
      after()
      return
    }
    animate(node, {
      opacity: [1, 0],
      scale: [1, 0.9],
      duration: 150,
      ease: 'inQuad',
      onComplete: after,
    })
  }

  function handleTitlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    onFocus()
    dragOrigin.current = { pointerX: e.clientX, pointerY: e.clientY, startX: state.x, startY: state.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleTitlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragOrigin.current) return
    const dx = e.clientX - dragOrigin.current.pointerX
    const dy = e.clientY - dragOrigin.current.pointerY
    let nextX = Math.max(0, dragOrigin.current.startX + dx)
    let nextY = Math.max(0, dragOrigin.current.startY + dy)
    // Bounds are 0 until ConsoleDesktop has measured the desktop container; skip the
    // max-clamp in that case rather than pinning everything to 0.
    if (bounds.width > 0) {
      nextX = Math.min(nextX, Math.max(0, bounds.width - MIN_REACHABLE_WIDTH))
    }
    if (bounds.height > 0) {
      nextY = Math.min(nextY, Math.max(0, bounds.height - MIN_REACHABLE_HEIGHT))
    }
    onDrag(nextX, nextY)
  }

  function handleTitlePointerUp() {
    dragOrigin.current = null
  }

  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const corner = e.currentTarget.dataset.corner as ResizeCorner
    e.stopPropagation()
    onFocus()
    resizeOrigin.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: state.x,
      startY: state.y,
      startWidth: state.width,
      startHeight: state.height,
      corner,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const origin = resizeOrigin.current
    if (!origin) return
    const dx = e.clientX - origin.pointerX
    const dy = e.clientY - origin.pointerY

    // 'ne'/'se' grow to the right (x stays put); 'nw'/'sw' grow to the left (x moves
    // with the left edge). Same idea vertically: 'sw'/'se' grow downward (y stays
    // put), 'nw'/'ne' grow upward (y moves with the top edge).
    const growsRight = origin.corner === 'ne' || origin.corner === 'se'
    const growsDown = origin.corner === 'sw' || origin.corner === 'se'

    const width = Math.max(MIN_WIDTH, growsRight ? origin.startWidth + dx : origin.startWidth - dx)
    const height = Math.max(MIN_HEIGHT, growsDown ? origin.startHeight + dy : origin.startHeight - dy)

    // Deriving x/y from the ACTUAL (post-clamp) width/height, not the raw dx/dy,
    // keeps the opposite edge fixed even once MIN_WIDTH/MIN_HEIGHT stops the resize
    // — otherwise the origin would keep sliding past the point where the size floor
    // was hit.
    const x = growsRight ? origin.startX : Math.max(0, origin.startX + (origin.startWidth - width))
    const y = growsDown ? origin.startY : Math.max(0, origin.startY + (origin.startHeight - height))

    onResize({ x, y, width, height })
  }

  function handleResizePointerUp() {
    resizeOrigin.current = null
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={state.title}
      onPointerDown={onFocus}
      className="absolute flex flex-col bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden"
      style={{ left: state.x, top: state.y, width: state.width, height: state.height, zIndex: state.zIndex }}
    >
      <div
        onPointerDown={handleTitlePointerDown}
        onPointerMove={handleTitlePointerMove}
        onPointerUp={handleTitlePointerUp}
        title="Drag to move"
        className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 cursor-move select-none shrink-0"
      >
        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{state.title}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onClick={() => playExitAnimation(onMinimize)}
            aria-label={`Minimize ${state.title}`}
            title={`Minimize ${state.title}`}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onClick={() => playExitAnimation(onClose)}
            aria-label={`Close ${state.title}`}
            title={`Close ${state.title}`}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {children}
      </div>

      <div
        data-corner="nw"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize"
        aria-hidden="true"
      />
      <div
        data-corner="ne"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        className="absolute top-0 right-0 w-4 h-4 cursor-nesw-resize"
        aria-hidden="true"
      />
      <div
        data-corner="sw"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize"
        aria-hidden="true"
      />
      <div
        data-corner="se"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        aria-hidden="true"
      />
    </div>
  )
}
