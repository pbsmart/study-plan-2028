import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { adaptCurriculum } from './adapter'
import { summarizeCoverage } from './coverage'
import { effectiveStatus } from './types'
import type { StudyWeekSummary } from './summary-types'

const moduleId = 'virtual:study-curriculum'
const resolvedModuleId = `\0${moduleId}`
const weekPrefix = `${moduleId}/week-`
const sourceFile = fileURLToPath(new URL('./study-plan-content-v1.json', import.meta.url))
const enrichmentDirectory = fileURLToPath(new URL('./enriched-week-01/', import.meta.url))
const enrichedSubjects: Record<string, string> = { chinese: '语文', math: '数学', english: '英语', physics: '物理', chemistry: '化学' }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

// Detailed pedagogical checks belong to the content suite. Fail the build rather
// than silently dropping malformed or misrouted optional enrichment files.
function validateEnrichment(value: unknown, subject: string, filename: string): asserts value is Record<string, unknown> & { title: string } {
  const fail = () => new Error(`第1周深化文件无效：${filename}`)
  if (!object(value) || value.week !== 1 || value.subject !== enrichedSubjects[subject] || value.id !== `w1-${enrichedSubjects[subject]}` || value.revision !== 'week01-enriched-v1' || value.status !== 'pilot-ready' || typeof value.title !== 'string' || !value.title.trim()) throw fail()
  for (const key of ['objectives', 'prerequisites', 'mastery']) if (!Array.isArray(value[key]) || !value[key].length || !value[key].every(item => typeof item === 'string' && item.trim())) throw fail()
  for (const key of ['sections', 'workedExamples', 'practice', 'misconceptions']) if (!Array.isArray(value[key]) || !value[key].length || !value[key].every(object)) throw fail()
  for (const key of ['budget', 'diagnostic', 'quiz', 'sourcePolicy']) if (!object(value[key])) throw fail()
  if (typeof value.nextStep !== 'string' || !value.nextStep.trim()) throw fail()
}

export interface CurriculumPluginOptions { sourceFile?: string; enrichmentDirectory?: string }
export async function readCurriculumData(options: CurriculumPluginOptions = {}) {
  const weeks = adaptCurriculum(JSON.parse(await readFile(options.sourceFile || sourceFile, 'utf8')))
  // The coverage describes the original 84-week course, not pilot enrichment.
  const coverage = summarizeCoverage(weeks)
  const summaries: StudyWeekSummary[] = weeks.map(week => ({
    week: week.week, title: week.title, stage: week.stage, summary: week.summary,
    subjects: Object.fromEntries(Object.entries(week.subjects).map(([id, lesson]) => [id, {
      title: lesson!.title, status: effectiveStatus(lesson),
    }])),
  }))
  const directory = options.enrichmentDirectory || enrichmentDirectory
  let files: string[]
  try { files = await readdir(directory) }
  catch (error) { if (object(error) && error.code === 'ENOENT') return { weeks, summaries, coverage }; throw error }
  for (const filename of files.filter(name => name.endsWith('.json')).sort()) {
    const subject = filename.slice(0, -5)
    if (!(subject in enrichedSubjects)) throw new Error(`未知第1周深化学科文件：${filename}`)
    const enrichment: unknown = JSON.parse(await readFile(join(directory, filename), 'utf8'))
    validateEnrichment(enrichment, subject, filename)
    const lesson = Object.entries(weeks.find(week => week.week === 1)?.subjects || {}).find(([id]) => id === subject)?.[1]
    const summary = Object.entries(summaries.find(week => week.week === 1)?.subjects || {}).find(([id]) => id === subject)?.[1]
    if (!lesson || !summary) throw new Error(`第1周原课程缺少深化学科：${subject}`)
    Object.assign(lesson, { enrichment })
    summary.enrichmentTitle = enrichment.title
  }
  return { weeks, summaries, coverage }
}

/** One source of truth, compiled to a small index and separately fetched weeks. */
export function curriculumPlugin(options: CurriculumPluginOptions = {}): Plugin {
  const source = options.sourceFile || sourceFile
  const enrichment = options.enrichmentDirectory || enrichmentDirectory
  let content: ReturnType<typeof readCurriculumData> | undefined
  async function watchSources(context: { addWatchFile: (path: string) => void }) {
    context.addWatchFile(source)
    // Vite's browser import analysis resolves files added during load. A
    // directory is not an importable module, so register the actual JSON files.
    let files: string[]
    try { files = await readdir(enrichment) }
    catch (error) { if (object(error) && error.code === 'ENOENT') return; throw error }
    for (const filename of files.filter(name => name.endsWith('.json'))) context.addWatchFile(join(enrichment, filename))
  }
  return {
    name: 'lazy-study-curriculum',
    async buildStart() { content = undefined; await watchSources(this) },
    resolveId(id) {
      if (id === moduleId || (id.startsWith(weekPrefix) && /^\d+$/.test(id.slice(weekPrefix.length)))) return `\0${id}`
    },
    async load(id) {
      if (id !== resolvedModuleId && !id.startsWith(`\0${weekPrefix}`)) return
      await watchSources(this)
      const data = await (content ||= readCurriculumData(options))
      if (id === resolvedModuleId) {
        return [
          `export const curriculum = ${JSON.stringify(data.summaries)};`,
          `export const curriculumCoverage = ${JSON.stringify(data.coverage)};`,
          `export const weekLoaders = {${data.weeks.map(week => `${week.week}: () => import(${JSON.stringify(`${weekPrefix}${String(week.week).padStart(2, '0')}`)})`).join(',')}};`,
        ].join('\n')
      }
      const weekNumber = Number(id.slice(`\0${weekPrefix}`.length))
      const week = data.weeks.find(item => item.week === weekNumber)
      if (!week) this.error(`课程缺少第 ${weekNumber} 周。`)
      return `export default ${JSON.stringify(week)};`
    },
    handleHotUpdate(ctx) {
      if (ctx.file !== source && !ctx.file.startsWith(enrichment)) return
      content = undefined
      ctx.server.moduleGraph.invalidateAll()
      ctx.server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}
