import { readFileSync } from 'fs'
import { join } from 'path'

// cardIn runs with fill-mode `both`, so a transform keyframe would keep
// overriding dnd-kit's inline drag transform after the animation ends.
describe('cardIn keyframes', () => {
  it('animate scale, not transform', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
    const block = css.match(/@keyframes cardIn \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(block).toContain('scale')
    expect(block).not.toContain('transform')
  })
})
