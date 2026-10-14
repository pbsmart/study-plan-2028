import { expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

it('transforms curriculum modules through browser import analysis without directory dependencies', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null },
  })
  try {
    const index = await server.transformRequest('virtual:study-curriculum')
    expect(index?.code).toContain('export const curriculum')
    expect(index?.code).toContain('week-01')
    const first = await server.transformRequest('virtual:study-curriculum/week-01')
    expect(first?.code).toContain('week01-enriched-v1')
    const final = await server.transformRequest('virtual:study-curriculum/week-84')
    expect(final?.code).toContain('自主验收')
  } finally { await server.close() }
}, 30_000)
