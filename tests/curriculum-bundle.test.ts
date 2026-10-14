import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'vite'

describe('production curriculum bundle', () => {
  it('leaves all 84 lesson chunks out of initial JavaScript and enforces the first-load budget', async () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const result = await build({ root, logLevel: 'silent', build: { write: false } })
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
    expect(weeks.every(chunk => chunk.isDynamicEntry && !initial.has(chunk.fileName))).toBe(true)
    const initialChunks = [...initial].map(filename => byFilename.get(filename)!)
    expect(initialChunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0)).toBeLessThan(350_000)
    expect(initialChunks.reduce((sum, chunk) => sum + gzipSync(chunk.code).length, 0)).toBeLessThan(110_000)
    const figures = result.output.filter((item): item is Extract<typeof item, { type: 'asset' }> => item.type === 'asset' && item.fileName.endsWith('.svg'))
    expect(figures).toHaveLength(4)
    for (const figure of figures) {
      expect(Buffer.byteLength(figure.source)).toBeLessThan(50_000)
      expect(initialChunks.some(chunk => chunk.code.includes(figure.fileName))).toBe(false)
      const weekTwo = weeks.find(chunk => chunk.facadeModuleId?.endsWith('week-02'))!
      expect(weekTwo.code).toContain(`/study-plan-2028/${figure.fileName}`)
    }
    expect(figures.reduce((sum, figure) => sum + Buffer.byteLength(figure.source), 0)).toBeLessThan(75_000)
    for (const chunk of weeks) {
      expect(Buffer.byteLength(chunk.code)).toBeLessThan(450_000)
      expect(gzipSync(chunk.code).length).toBeLessThan(150_000)
    }
  }, 30_000)
  it('resolves static SVG URLs correctly under a non-root production base',async()=>{
    const root=fileURLToPath(new URL('..',import.meta.url))
    const result=await build({root,base:'/nested/learning/',logLevel:'silent',build:{write:false}})
    if(!('output'in result))throw new Error('Expected browser output')
    const week=result.output.find(item=>item.type==='chunk'&&item.facadeModuleId?.endsWith('week-02'))
    if(!week||week.type!=='chunk')throw new Error('Missing second week')
    const figures=result.output.filter(item=>item.type==='asset'&&item.fileName.endsWith('.svg'))
    expect(figures).toHaveLength(4)
    for(const figure of figures)expect(week.code).toContain(`/nested/learning/${figure.fileName}`)
    expect(week.code).not.toContain('/workspace/')
  },30_000)

})
