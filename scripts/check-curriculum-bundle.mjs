import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

// Run after npm run build. Walk the actual static-import graph so a future
// shared chunk cannot quietly move all lesson bodies back into the first load.
const directory = resolve(process.argv[2] || 'dist')
const manifest = JSON.parse(await readFile(join(directory, '.vite/manifest.json'), 'utf8'))
const entries = Object.keys(manifest).filter(key => manifest[key].isEntry)
if (!entries.length) throw new Error('No application entry in the build manifest.')
const initial = new Set()
function visit(key) {
  if (initial.has(key)) return
  if (!manifest[key]) throw new Error(`Missing manifest entry: ${key}`)
  initial.add(key)
  for (const imported of manifest[key].imports || []) visit(imported)
}
entries.forEach(visit)
const weekKeys = Object.keys(manifest).filter(key => /^virtual:study-curriculum\/week-\d{2}$/.test(key))
if (weekKeys.length !== 84 || new Set(weekKeys.map(key => Number(key.slice(-2)))).size !== 84 || weekKeys.some(key => !manifest[key].isDynamicEntry || initial.has(key))) throw new Error('Expected 84 separate, lazy-loaded week modules.')
async function size(key) {
  const bytes = await readFile(join(directory, manifest[key].file))
  return { file: manifest[key].file, bytes: bytes.length, gzipBytes: gzipSync(bytes).length }
}
const initialFiles = await Promise.all([...initial].map(size))
const weekFiles = await Promise.all(weekKeys.map(size))
const initialBytes = initialFiles.reduce((sum, item) => sum + item.bytes, 0)
const initialGzipBytes = initialFiles.reduce((sum, item) => sum + item.gzipBytes, 0)
const largestWeek = weekFiles.reduce((largest, item) => item.bytes > largest.bytes ? item : largest)
const figures = await Promise.all(Object.keys(manifest).filter(key => /enriched-week-\d+\/assets\/.*\.svg$/.test(key)).map(size))
if (figures.length !== 4 || figures.some(figure => figure.bytes > 50_000) || figures.reduce((sum, figure) => sum + figure.bytes, 0) > 75_000) throw new Error('Expected four static SVGs within the 50 KB per-file / 75 KB total figure budget.')
const secondWeekAssets = new Set(manifest['virtual:study-curriculum/week-02']?.assets || [])
for (const figure of figures) if (!secondWeekAssets.has(figure.file)) throw new Error('A static figure is not owned by the lazy second-week chunk.')
const report = { figures, initialFiles, initialBytes, initialGzipBytes, lazyWeeks: weekFiles.length, largestWeek, allJavaScriptBytes: initialBytes + weekFiles.reduce((sum, item) => sum + item.bytes, 0) }
console.log(JSON.stringify(report, null, 2))
if (initialBytes > 350_000 || initialGzipBytes > 110_000) throw new Error('Initial JavaScript exceeds the 350 KB / 110 KB gzip performance budget.')
if (largestWeek.bytes > 450_000 || largestWeek.gzipBytes > 150_000) throw new Error('A single week exceeds the 450 KB / 150 KB gzip budget.')
