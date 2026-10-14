import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { normalizePath } from 'vite'
import type { Plugin } from 'vite'
import { adaptCurriculum } from './adapter'
import { summarizeCoverage } from './coverage'
import { effectiveStatus } from './types'
import type { StudyWeek, SubjectWeek } from './types'
import type { EnrichedLesson, StaticLessonFigure } from './enriched-types'
import type { StudyWeekSummary } from './summary-types'
import { enrichmentConfigs } from './enrichment-config'
import type { EnrichmentConfig } from './enrichment-config'

const moduleId = 'virtual:study-curriculum'
const resolvedModuleId = `\0${moduleId}`
const weekPrefix = `${moduleId}/week-`
const curriculumDirectory = fileURLToPath(new URL('.', import.meta.url))
const sourceFile = join(curriculumDirectory, 'study-plan-content-v1.json')
const enrichedSubjects: Record<string, string> = { chinese: '语文', math: '数学', english: '英语', physics: '物理', chemistry: '化学' }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string' && !!item.trim())

// Preserve original content fields; attach a separately validated pilot overlay.
function validateEnrichment(value: unknown, subject: string, filename: string, config: EnrichmentConfig): asserts value is EnrichedLesson {
  const fail = () => new Error(`第${config.week}周深化文件无效：${filename}`)
  if (!object(value) || value.week !== config.week || value.subject !== enrichedSubjects[subject] || value.id !== `w${config.week}-${enrichedSubjects[subject]}` || value.revision !== config.revision || value.status !== 'pilot-ready' || typeof value.title !== 'string' || !value.title.trim()) throw fail()
  for (const key of ['objectives', 'prerequisites', 'mastery']) if (!strings(value[key]) || !value[key].length) throw fail()
  for (const key of ['sections', 'workedExamples', 'practice', 'misconceptions']) if (!Array.isArray(value[key]) || !value[key].length || !value[key].every(object)) throw fail()
  for (const key of ['budget', 'diagnostic', 'quiz', 'sourcePolicy']) if (!object(value[key])) throw fail()
  if (typeof value.nextStep !== 'string' || !value.nextStep.trim()) throw fail()
}

export interface CurriculumPluginOptions {
  sourceFile?: string
  enrichments?: EnrichmentConfig[]
  /** Compatibility for isolated week-one fixtures; new callers use enrichments. */
  enrichmentDirectory?: string
}
function configuredEnrichments(options: CurriculumPluginOptions) {
  const values = options.enrichments || (options.enrichmentDirectory ? [{ week: 1, revision: 'week01-enriched-v1', directory: options.enrichmentDirectory }] : enrichmentConfigs)
  const seen = new Set<number>()
  for (const config of values) {
    if (!Number.isInteger(config.week) || config.week < 1 || config.week > 84 || seen.has(config.week) || !config.revision || !config.directory) throw new Error('深化周配置无效或重复。')
    seen.add(config.week)
  }
  return values.map(config => ({ ...config, directory: isAbsolute(config.directory) ? config.directory : resolve(curriculumDirectory, config.directory) }))
}
function localAsset(directory: string, asset: unknown, extension: 'svg' | 'json') {
  if (typeof asset !== 'string' || !new RegExp(`^assets/[a-z0-9-]+\\.${extension}$`).test(asset)) throw new Error('图解必须引用包内 assets/ 文件。')
  return join(directory, asset)
}
async function readFigure(value: unknown, lesson: EnrichedLesson, config: EnrichmentConfig, sourceFiles: Set<string>): Promise<StaticLessonFigure> {
  if (!object(value) || typeof value.id !== 'string' || !value.id.startsWith(`w${config.week}-`) || typeof value.title !== 'string' || !value.title.trim() || typeof value.altText !== 'string' || !value.altText.trim() || !strings(value.linkedSectionIds)) throw new Error('静态图解缺少标识、标题、等效文本或关联小节。')
  const questionIds = value.linkedQuestionIds === undefined ? [] : value.linkedQuestionIds
  if (!strings(questionIds) || (!value.linkedSectionIds.length && !questionIds.length)) throw new Error('静态图解缺少有效关联。')
  const sections = new Set(lesson.sections.map(section => section.id))
  const questions = new Set([...lesson.diagnostic.questions, ...lesson.workedExamples, ...lesson.practice, ...lesson.quiz.questions].map(question => question.id))
  if (value.linkedSectionIds.some(id => !sections.has(id)) || questionIds.some(id => !questions.has(id))) throw new Error('静态图解关联了不存在的小节或题目。')
  const path = localAsset(config.directory, value.asset, 'svg')
  const svg = await readFile(path, 'utf8')
  // Images are displayed through <img>, never as inline HTML; disallow active or remote content as well.
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(svg) || /<\s*(?:script|foreignObject|iframe|animate|set)\b|<!DOCTYPE|\bon\w+\s*=|(?:href|src)\s*=\s*["']\s*(?!#)|url\(\s*["']?\s*(?!#)/i.test(svg)) throw new Error(`图解含不支持的活动内容或外部资源：${value.asset}`)
  const viewBox = /\bviewBox\s*=\s*["']\s*([\d.-]+)\s+([\d.-]+)\s+([\d.]+)\s+([\d.]+)\s*["']/.exec(svg)
  if (!viewBox || !viewBox.slice(1).every(value => Number.isFinite(Number(value))) || Number(viewBox[3]) <= 0 || Number(viewBox[4]) <= 0) throw new Error('静态图解需要有效viewBox。')
  sourceFiles.add(path)
  return { id: value.id, title: value.title, src: path, altText: value.altText, caption: typeof value.description === 'string' ? value.description : value.altText, linkedSectionIds: value.linkedSectionIds, linkedQuestionIds: questionIds, width: Number(viewBox[3]), height: Number(viewBox[4]) }
}

export async function readCurriculumData(options: CurriculumPluginOptions = {}) {
  const source = options.sourceFile || sourceFile
  const sourceFiles = new Set([source])
  const weeks = adaptCurriculum(JSON.parse(await readFile(source, 'utf8')))
  const coverage = summarizeCoverage(weeks)
  const summaries: StudyWeekSummary[] = weeks.map(week => ({ week: week.week, title: week.title, stage: week.stage, summary: week.summary, subjects: Object.fromEntries(Object.entries(week.subjects).map(([id, lesson]) => [id, { title: lesson!.title, status: effectiveStatus(lesson) }])) }))
  for (const config of configuredEnrichments(options)) {
    let files: string[]
    try { files = await readdir(config.directory) }
    catch (error) { if (object(error) && error.code === 'ENOENT') continue; throw error }
    const week = weeks.find(week => week.week === config.week), summary = summaries.find(week => week.week === config.week)
    for (const filename of files.filter(name => name.endsWith('.json')).sort()) {
      const subject = filename.slice(0, -5)
      if (!(subject in enrichedSubjects)) throw new Error(`未知第${config.week}周深化学科文件：${filename}`)
      const path = join(config.directory, filename)
      sourceFiles.add(path)
      const enrichment: unknown = JSON.parse(await readFile(path, 'utf8'))
      validateEnrichment(enrichment, subject, filename, config)
      const lesson = Object.entries(week?.subjects || {}).find(([id]) => id === subject)?.[1]
      const subjectSummary = Object.entries(summary?.subjects || {}).find(([id]) => id === subject)?.[1]
      if (!lesson || !subjectSummary) throw new Error(`第${config.week}周原课程缺少深化学科：${subject}`)
      lesson.enrichment = enrichment
      subjectSummary.enrichmentTitle = enrichment.title
    }
    const attachFigure = async (subject: string, value: unknown) => {
      if (!(subject in enrichedSubjects)) throw new Error('静态图解不得替候选第三科设置深化内容。')
      const lesson = week?.subjects[subject as keyof typeof week.subjects]
      if (!lesson?.enrichment) throw new Error('静态图解缺少对应深化课程。')
      const figure = await readFigure(value, lesson.enrichment, config, sourceFiles)
      if (lesson.enrichmentFigures?.some(item => item.id === figure.id)) throw new Error('静态图解标识重复。')
      ;(lesson.enrichmentFigures ||= []).push(figure)
    }
    for (const manifest of config.figureManifests || []) {
      const path = localAsset(config.directory, manifest.file, 'json')
      sourceFiles.add(path)
      const figures: unknown = JSON.parse(await readFile(path, 'utf8'))
      for (const figure of Array.isArray(figures) ? figures : [figures]) await attachFigure(manifest.subject, figure)
    }
    if (config.preferDiagramAssets) for (const [subject, lesson] of Object.entries(week?.subjects || {})) for (const diagram of lesson?.enrichment?.diagrams || []) if (diagram.asset) await attachFigure(subject, { ...diagram, linkedQuestionIds: config.diagramQuestionLinks?.[diagram.id] || [] })
  }
  return { weeks, summaries, coverage, sourceFiles: [...sourceFiles] }
}

function weekModule(week: StudyWeek) {
  const serialized = JSON.parse(JSON.stringify(week)) as StudyWeek
  const imports: string[] = [], assignments: string[] = []
  for (const [subject, lesson] of Object.entries(serialized.subjects)) (lesson as SubjectWeek).enrichmentFigures?.forEach((figure, index) => {
    const variable = `figureAsset${imports.length}`
    imports.push(`import ${variable} from ${JSON.stringify(`${normalizePath(figure.src)}?url&no-inline`)};`)
    figure.src = ''
    assignments.push(`week.subjects[${JSON.stringify(subject)}].enrichmentFigures[${index}].src = ${variable};`)
  })
  return [...imports, `const week = ${JSON.stringify(serialized)};`, ...assignments, 'export default week;'].join('\n')
}

/** Preserve the Vite dev fix: watch actual files, never a directory dependency. */
export function curriculumPlugin(options: CurriculumPluginOptions = {}): Plugin {
  const source = options.sourceFile || sourceFile
  const configurations = configuredEnrichments(options)
  let content: ReturnType<typeof readCurriculumData> | undefined
  return {
    name: 'lazy-study-curriculum',
    async buildStart() { content = readCurriculumData(options); for (const path of (await content).sourceFiles) this.addWatchFile(path) },
    resolveId(id) { if (id === moduleId || (id.startsWith(weekPrefix) && /^\d+$/.test(id.slice(weekPrefix.length)))) return `\0${id}` },
    async load(id) {
      if (id !== resolvedModuleId && !id.startsWith(`\0${weekPrefix}`)) return
      const data = await (content ||= readCurriculumData(options))
      for (const path of data.sourceFiles) this.addWatchFile(path)
      if (id === resolvedModuleId) return [
        `export const curriculum = ${JSON.stringify(data.summaries)};`,
        `export const curriculumCoverage = ${JSON.stringify(data.coverage)};`,
        `export const weekLoaders = {${data.weeks.map(week => `${week.week}: () => import(${JSON.stringify(`${weekPrefix}${String(week.week).padStart(2, '0')}`)})`).join(',')}};`,
      ].join('\n')
      const week = data.weeks.find(item => item.week === Number(id.slice(`\0${weekPrefix}`.length)))
      if (!week) this.error('课程缺少对应学习周。')
      return weekModule(week)
    },
    handleHotUpdate(ctx) {
      if (ctx.file !== source && !configurations.some(config => ctx.file.startsWith(config.directory + sep))) return
      content = undefined
      ctx.server.moduleGraph.invalidateAll()
      ctx.server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}
