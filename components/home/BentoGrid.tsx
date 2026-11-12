'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { Flip } from 'gsap/Flip'

let flipRegistered = false

interface GridImage {
  src: string
  column: number
  row: number
  // Left blank for now — fill in per cell once the destination is decided.
  link: string
}

// Layout ported from the provided demo's data-column/data-row grid.
// Tiles are generic placeholders — point each link at your own tools.
const IMAGES: GridImage[] = [
  { column: 0, row: 0, src: '/tiles/tile-1.svg', link: '#' },
  { column: 1, row: 0, src: '/tiles/tile-2.svg', link: '#' },
  { column: 2, row: 0, src: '/tiles/tile-3.svg', link: '#' },
  { column: 0, row: 1, src: '/tiles/tile-4.svg', link: '#' },
  { column: 1, row: 1, src: '/tiles/tile-5.svg', link: '#' },
  { column: 2, row: 1, src: '/tiles/tile-6.svg', link: '#' },
  { column: 0, row: 2, src: '/tiles/tile-7.svg', link: '#' },
  { column: 1, row: 2, src: '/tiles/tile-8.svg', link: '#' },
  { column: 2, row: 2, src: '/tiles/tile-9.svg', link: '#' },
]

function templateFor(active: number): string {
  return [0, 1, 2].map(i => (i === active ? '3fr' : '1fr')).join(' ')
}

export default function BentoGrid() {
  const containerRef = useRef<HTMLDivElement>(null)
  const flipStateRef = useRef<ReturnType<typeof Flip.getState> | null>(null)
  const [activeColumn, setActiveColumn] = useState(1)
  const [activeRow, setActiveRow] = useState(1)

  useLayoutEffect(() => {
    if (!flipRegistered) {
      gsap.registerPlugin(Flip)
      flipRegistered = true
    }
  }, [])

  // Fires after React commits the new grid-template (post-DOM-update,
  // pre-paint) — exactly where Flip expects to animate from the state
  // captured just before the change to the layout that's now on screen.
  // Scoped with gsap.context() so ctx.revert() kills any in-flight tween
  // (a new hover mid-animation, or this component unmounting because the
  // user navigated away) instead of leaving it running against stale/
  // detached nodes.
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      if (flipStateRef.current) {
        Flip.from(flipStateRef.current, { duration: 0.4, ease: 'power2.out', absolute: true })
        flipStateRef.current = null
      }
    }, containerRef)
    return () => ctx.revert()
  }, [activeColumn, activeRow])

  function activate(column: number, row: number) {
    if (column === activeColumn && row === activeRow) return
    if (!containerRef.current) return
    flipStateRef.current = Flip.getState(containerRef.current.querySelectorAll('[data-bento-item]'))
    setActiveColumn(column)
    setActiveRow(row)
  }

  return (
    <div
      ref={containerRef}
      onMouseLeave={() => activate(1, 1)}
      className="grid gap-2 w-full h-full max-h-[36rem] mx-auto"
      style={{ gridTemplateColumns: templateFor(activeColumn), gridTemplateRows: templateFor(activeRow) }}
    >
      {IMAGES.map(img => {
        const isActive = img.column === activeColumn && img.row === activeRow
        return (
          <div
            key={img.src}
            data-bento-item
            onMouseEnter={() => activate(img.column, img.row)}
            className={`relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900 cursor-pointer
              transition-[opacity,box-shadow] duration-300
              ${isActive ? 'opacity-100 ring-2 ring-blue-500/60' : 'opacity-65 ring-1 ring-white/10'}`}
            style={{ gridColumn: img.column + 1, gridRow: img.row + 1 }}
          >
            <a href={img.link} target="_blank" rel="noopener noreferrer" className="absolute inset-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- one cell is an external URL; plain <img> matches the pattern already used elsewhere in this app (e.g. ManagementPostBoard) */}
              <img src={img.src} alt="" className="w-full h-full object-cover" />
            </a>
          </div>
        )
      })}
    </div>
  )
}
