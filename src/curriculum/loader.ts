import type { StudyWeek, SubjectWeek } from './types'
import type { StudyWeekSummary } from './summary-types'
import { effectiveStatus } from './types'

type WeekImporter = () => Promise<{ default: unknown }>
export type CurriculumLoadErrorCode = 'invalid-week' | 'unavailable' | 'load-failed' | 'invalid-content'
export class CurriculumLoadError extends Error {
  readonly week: number
  readonly code: CurriculumLoadErrorCode
  constructor(week: number, code: CurriculumLoadErrorCode, message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'CurriculumLoadError'
    this.week = week
    this.code = code
  }
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const textList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
function isLesson(value: unknown): value is SubjectWeek {
  if (!object(value) || typeof value.title !== 'string' || !['complete', 'outline', 'pending'].includes(String(value.status))) return false
  if (!['goals', 'prerequisites', 'examPoints', 'sourceIds'].every(key => textList(value[key]))) return false
  if (!Array.isArray(value.knowledge) || !value.knowledge.every(block => object(block) && typeof block.title === 'string' && textList(block.paragraphs))) return false
  const validProblem = (problem: unknown) => object(problem) && typeof problem.id === 'string' && problem.origin === 'original' && typeof problem.title === 'string' && typeof problem.prompt === 'string' && typeof problem.answer === 'string' && textList(problem.solution)
  if (!['examples', 'exercises'].every(key => Array.isArray(value[key]) && value[key].every(validProblem))) return false
  if (!object(value.retest) || !textList(value.retest.tasks) || !textList(value.retest.criteria) || (value.retest.problem !== undefined && !validProblem(value.retest.problem))) return false
  if (value.diagnosticTest !== undefined && (!object(value.diagnosticTest) || !Array.isArray(value.diagnosticTest.questions) || !value.diagnosticTest.questions.every(validProblem))) return false
  return true
}

function validateWeek(value: unknown, summary: StudyWeekSummary): StudyWeek {
  const fail = () => new CurriculumLoadError(summary.week, 'invalid-content', `第 ${summary.week} 周课程数据不完整，请刷新后重试。`)
  if (!object(value) || value.week !== summary.week || value.title !== summary.title || value.stage !== summary.stage || value.summary !== summary.summary || !object(value.subjects)) throw fail()
  if (Object.keys(value.subjects).length !== Object.keys(summary.subjects).length) throw fail()
  for (const [subject, expected] of Object.entries(summary.subjects)) {
    const lesson = value.subjects[subject]
    if (!isLesson(lesson) || lesson.title !== expected!.title || effectiveStatus(lesson) !== expected!.status) throw fail()
  }
  return value as unknown as StudyWeek
}

/** No lesson is imported until loadStudyWeek is called. Failures are never cached. */
export function createStudyWeekLoader(summaries: StudyWeekSummary[], importers: Record<number, WeekImporter>) {
  const summariesByWeek = new Map(summaries.map(week => [week.week, week]))
  const loaded = new Map<number, StudyWeek>()
  const pending = new Map<number, Promise<StudyWeek>>()
  function loadStudyWeek(week: number): Promise<StudyWeek> {
    if (!Number.isInteger(week) || week < 1 || week > 84) return Promise.reject(new CurriculumLoadError(week, 'invalid-week', '学习周编号须为 1—84 的整数。'))
    const summary = summariesByWeek.get(week), importer = importers[week]
    if (!summary || !importer) return Promise.reject(new CurriculumLoadError(week, 'unavailable', `第 ${week} 周课程尚未接入。`))
    const cached = loaded.get(week)
    if (cached) return Promise.resolve(cached)
    const inFlight = pending.get(week)
    if (inFlight) return inFlight
    // A microtask makes synchronous failures use the same cleanup/retry path.
    const request = Promise.resolve().then(importer).then(module => {
      const result = validateWeek(module?.default, summary)
      loaded.set(week, result)
      return result
    }).catch((cause: unknown) => {
      if (cause instanceof CurriculumLoadError) throw cause
      throw new CurriculumLoadError(week, 'load-failed', `第 ${week} 周课程加载失败，请检查网络后重试。`, cause)
    }).finally(() => pending.delete(week))
    pending.set(week, request)
    return request
  }
  return { loadStudyWeek, peekStudyWeek: (week: number) => loaded.get(week) }
}
