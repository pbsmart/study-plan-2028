import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'vite'

const expectedFigures = new Map([[2, 4], [3, 6], [4, 7], [5, 10], [6, 10], [7, 10], [8, 10], [9, 8], [10, 7]])

describe('production curriculum bundle', () => {
  // Vite's production flag follows NODE_ENV; Vitest normally sets it to test.
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'))
  afterEach(() => vi.unstubAllEnvs())
  it.each(['/study-plan-2028/', '/nested/learning/'])('keeps 84 weeks and all 72 SVGs lazy and within budget under %s', async base => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const result = await build({ root, base, logLevel: 'silent', build: { write: false } })
    if (!('output' in result)) throw new Error('Expected a single browser build')
    const chunks = result.output.filter(item => item.type === 'chunk')
    const byFilename = new Map(chunks.map(chunk => [chunk.fileName, chunk]))
    const initial = new Set<string>()
    const visit = (filename: string) => {
      if (initial.has(filename)) return
      initial.add(filename)
      byFilename.get(filename)?.imports.forEach(visit)
    }
    chunks.filter(chunk => chunk.isEntry).forEach(chunk => visit(chunk.fileName))
    expect(initial.size).toBeGreaterThan(0)
    const weeks = chunks.filter(chunk => chunk.facadeModuleId?.startsWith('\0virtual:study-curriculum/week-'))
    expect(weeks).toHaveLength(84)
    expect(new Set(weeks.map(chunk => chunk.facadeModuleId)).size).toBe(84)
    expect(weeks.every(chunk => chunk.isDynamicEntry && !initial.has(chunk.fileName))).toBe(true)
    const initialChunks = [...initial].map(filename => byFilename.get(filename)!)
    expect(initialChunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0)).toBeLessThan(350_000)
    expect(initialChunks.reduce((sum, chunk) => sum + gzipSync(chunk.code).length, 0)).toBeLessThan(110_000)

    const figures = result.output.filter((item): item is Extract<typeof item, { type: 'asset' }> => item.type === 'asset' && item.fileName.endsWith('.svg'))
    expect(figures).toHaveLength(72)
    expect(new Set(figures.map(figure => figure.fileName)).size).toBe(72)
    for (const figure of figures) {
      expect(Buffer.byteLength(figure.source)).toBeLessThan(50_000)
      expect(initialChunks.some(chunk => chunk.code.includes(figure.fileName))).toBe(false)
      const owners = weeks.filter(chunk => chunk.code.includes(figure.fileName))
      expect(owners).toHaveLength(1)
      expect(owners[0]!.code).toContain(`${base}${figure.fileName}`)
      expect(expectedFigures.has(Number(owners[0]!.facadeModuleId!.slice(-2)))).toBe(true)
    }
    for (const [weekNumber, expectedCount] of expectedFigures) {
      const week = weeks.find(chunk => chunk.facadeModuleId?.endsWith(`week-${String(weekNumber).padStart(2, '0')}`))!
      const ownedFigures = figures.filter(figure => week.code.includes(figure.fileName))
      expect(ownedFigures).toHaveLength(expectedCount)
      expect(ownedFigures.reduce((sum, figure) => sum + Buffer.byteLength(figure.source), 0)).toBeLessThan(75_000)
    }
    expect(figures.reduce((sum, figure) => sum + Buffer.byteLength(figure.source), 0)).toBeLessThan(372_328)
    for (const chunk of chunks) expect(chunk.code.includes('/workspace/'), chunk.fileName).toBe(false)
    for (const chunk of weeks) {
      expect(Buffer.byteLength(chunk.code)).toBeLessThan(450_000)
      expect(gzipSync(chunk.code).length).toBeLessThan(150_000)
    }
  }, 30_000)
})
