import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const directory = resolve(process.argv[2] || 'dist')
const manifest = JSON.parse(await readFile(join(directory, '.vite/manifest.json'), 'utf8'))
const aiKey = 'src/components/LearningAiDialog.vue'
const ai = manifest[aiKey]
if (!ai?.isDynamicEntry) throw new Error('AI dialog must remain an independent dynamic module.')
const initial = new Set()
function visit(key) { if (initial.has(key)) return; initial.add(key); for (const child of manifest[key]?.imports || []) visit(child) }
Object.keys(manifest).filter(key => manifest[key].isEntry).forEach(visit)
if (initial.has(aiKey)) throw new Error('AI dialog is eagerly loaded.')
for (const key of initial) {
  const code = await readFile(join(directory, manifest[key].file), 'utf8')
  if (code.includes('xunxu.deepseek.api-key.v1') || code.includes('api.deepseek.com/chat/completions')) throw new Error('Key handling or API client is in the initial bundle.')
}
const bytes = await readFile(join(directory, ai.file))
const report = { file: ai.file, bytes: bytes.length, gzipBytes: gzipSync(bytes).length, css: ai.css || [] }
if (report.bytes >= 40000 || report.gzipBytes >= 15000) throw new Error('AI chunk exceeds 40 KB / 15 KB gzip budget.')
console.log(JSON.stringify(report, null, 2))
