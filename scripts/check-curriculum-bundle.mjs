import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

// Run after npm run build. Walk the actual static-import graph so a future
// shared chunk cannot quietly move all lesson bodies back into the first load.
const directory = resolve(process.argv[2] || 'dist')
const base = process.argv[3] || process.env.VITE_BASE_PATH || '/study-plan-2028/'
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
const largestGzipWeek = weekFiles.reduce((largest, item) => item.gzipBytes > largest.gzipBytes ? item : largest)
const expectedFigures = new Map([[2, 4], [3, 6], [4, 7], [5, 10], [6, 10], [7, 10], [8, 10], [9, 8], [10, 7], [11, 7], [12, 8]])
const figureKeys = Object.keys(manifest).filter(key => /enriched-week-\d+\/assets\/.*\.svg$/.test(key))
const figures = await Promise.all(figureKeys.map(async key => ({ ...await size(key), week: Number(/enriched-week-(\d+)/.exec(key)[1]) })))
if (figures.length !== 87 || new Set(figures.map(figure => figure.file)).size !== 87 || figures.some(figure => figure.bytes >= 50_000) || figures.reduce((sum, figure) => sum + figure.bytes, 0) >= 419_294) throw new Error('Expected 87 static SVGs within the 50 KB per-file / 419,294-byte total figure budget.')
const initialCode = await Promise.all([...initial].map(key => readFile(join(directory, manifest[key].file), 'utf8')))
const weekCode = new Map(await Promise.all(weekKeys.map(async key => [key, await readFile(join(directory, manifest[key].file), 'utf8')])))
for (const code of [...initialCode, ...weekCode.values()]) if (code.includes('/workspace/')) throw new Error('A generated JavaScript chunk leaks a workspace path.')
for (const [week, count] of expectedFigures) {
  const owned = figures.filter(figure => figure.week === week)
  if (owned.length !== count || owned.reduce((sum, figure) => sum + figure.bytes, 0) >= 75_000) throw new Error(`Week ${week} must own ${count} SVGs within its 75 KB figure budget.`)
}
for (const figure of figures) {
  const owner = `virtual:study-curriculum/week-${String(figure.week).padStart(2, '0')}`
  if (!expectedFigures.has(figure.week) || !manifest[owner]?.assets?.includes(figure.file)) throw new Error(`Static figure is not owned by its lazy week: ${figure.file}`)
  const owners = weekKeys.filter(key => manifest[key].assets?.includes(figure.file) || weekCode.get(key).includes(figure.file))
  if (owners.length !== 1 || owners[0] !== owner) throw new Error(`Static figure has the wrong lazy ownership: ${figure.file}`)
  if ([...initial].some(key => manifest[key].assets?.includes(figure.file)) || initialCode.some(code => code.includes(figure.file))) throw new Error(`Static figure is eagerly referenced by the application: ${figure.file}`)
  if (!weekCode.get(owner).includes(`${base}${figure.file}`)) throw new Error(`Static figure URL does not honor production base ${base}: ${figure.file}`)
}
// Include independently lazy features (such as the AI dialog) in the total, without treating them as initial downloads.
const allJavaScriptFiles = [...new Map((await Promise.all(Object.keys(manifest).filter(key => manifest[key].file.endsWith('.js')).map(size))).map(item => [item.file, item])).values()]
const courseAndInitialFiles = new Set([...initialFiles, ...weekFiles].map(item => item.file))
const optionalJavaScriptFiles = allJavaScriptFiles.filter(item => !courseAndInitialFiles.has(item.file))
const report = { figures, initialFiles, initialBytes, initialGzipBytes, lazyWeeks: weekFiles.length, largestWeek, largestGzipWeek, optionalJavaScriptFiles, allJavaScriptBytes: allJavaScriptFiles.reduce((sum, item) => sum + item.bytes, 0) }
console.log(JSON.stringify(report, null, 2))
if (initialBytes >= 350_000 || initialGzipBytes >= 110_000) throw new Error('Initial JavaScript exceeds the 350 KB / 110 KB gzip performance budget.')
if (weekFiles.some(week => week.bytes >= 450_000 || week.gzipBytes >= 150_000)) throw new Error('A single week exceeds the 450 KB / 150 KB gzip budget.')
