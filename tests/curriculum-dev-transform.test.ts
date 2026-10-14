import { expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

it('transforms all enhanced weeks and their SVG URLs through real browser import analysis without a socket', async () => {
  for (const base of ['/', '/study-plan-2028/', '/nested/learning/']) {
    const server = await createServer({
      base,
      root: fileURLToPath(new URL('..', import.meta.url)),
      logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, watch: null },
    })
    try {
      expect(server.httpServer).toBeNull()
      const index = await server.transformRequest('virtual:study-curriculum')
      expect(index?.code).toContain('export const curriculum')
      expect(index?.code).toContain('week-01')
      expect(index?.code).toContain('week-84')
      expect(index?.code).not.toContain('.svg')
      for (const [week, figureCount] of [[1, 0], [2, 4], [3, 6], [4, 7], [5, 10], [6, 10]]) {
        const number = String(week).padStart(2, '0')
        const transformed = await server.transformRequest(`virtual:study-curriculum/week-${number}`)
        expect(transformed?.code).toContain(`week${number}-enriched-v1`)
        expect(transformed?.code).not.toContain('/workspace/')
        expect(transformed?.code).not.toMatch(/import\s+["']\/?[^"']*enriched-week-\d+\/["']/)
        const imports = [...(transformed?.code || '').matchAll(/import figureAsset\d+ from ["']([^"']+\.svg[^"']*)["']/g)]
        expect(imports).toHaveLength(figureCount!)
        for (const [, url] of imports) {
          expect(url).toContain(`${base}src/curriculum/enriched-week-${number}/assets/`)
          expect(url).toContain('url')
          // Vite's base middleware removes the prefix before calling transformRequest.
          const requestUrl = base === '/' ? url! : `/${url!.slice(base.length)}`
          const asset = await server.transformRequest(requestUrl)
          expect(asset?.code).toContain(`export default "${base}src/curriculum/enriched-week-${number}/assets/`)
          expect(asset?.code).not.toContain('/workspace/')
        }
        if (week === 4) expect(transformed?.code).toContain('enrichmentReviewMap')
      }
      const final = await server.transformRequest('virtual:study-curriculum/week-84')
      expect(final?.code).toContain('自主验收')
    } finally { await server.close() }
  }
}, 30_000)
