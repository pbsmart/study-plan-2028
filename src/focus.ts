import type { SubjectId } from './model'
import type { SubjectWeek } from './curriculum/types'

export type LessonSection = 'prepare' | 'knowledge' | 'examples' | 'practice' | 'retest' | 'diagnostic'
export interface LessonStep { id: string; title: string; checkpoint?: 'knowledge' | 'example' | 'practice' | 'retest'; optional?: boolean }
export function lessonSteps(lesson?: SubjectWeek): LessonStep[] {
  if (lesson?.enrichment) {
    const lessonData = lesson.enrichment
    const sections = lessonData.sections.filter(section => section.level !== 'extension')
    const examples = lessonData.workedExamples.filter(problem => problem.level !== 'extension')
    const practice = lessonData.practice.filter(problem => problem.level !== 'extension')
    const steps: LessonStep[] = [{ id: 'prepare', title: '学习准备' }, { id: 'diagnostic', title: '课前自测' }]
    sections.forEach((section, i) => steps.push({ id: section.id, title: section.title, checkpoint: i === sections.length - 1 ? 'knowledge' : undefined }))
    examples.forEach((problem, i) => steps.push({ id: problem.id, title: `例题 ${i + 1} · ${problem.title}`, checkpoint: i === examples.length - 1 ? 'example' : undefined }))
    practice.forEach((problem, i) => steps.push({ id: problem.id, title: `练习 ${i + 1} · ${problem.title}`, checkpoint: i === practice.length - 1 ? 'practice' : undefined }))
    steps.push({ id: 'quiz', title: `${lessonData.quiz.totalPoints} 分短测` }, { id: 'review', title: '订正与回顾', checkpoint: 'retest' })
    for (const item of [...lessonData.sections, ...lessonData.workedExamples, ...lessonData.practice].filter(item => item.level === 'extension')) steps.push({ id: item.id, title: `可选拓展 · ${item.title}`, optional: true })
    return steps
  }
  const steps: LessonStep[] = [{ id: 'prepare', title: '学习准备' }]
  if (lesson?.knowledge.length) steps.push({ id: 'knowledge', title: '知识讲解', checkpoint: 'knowledge' })
  if (lesson?.examples.length) steps.push({ id: 'examples', title: '例题精讲', checkpoint: 'example' })
  if (lesson?.exercises.length) steps.push({ id: 'practice', title: '独立练习', checkpoint: 'practice' })
  if (lesson?.retest.tasks.length) steps.push({ id: 'retest', title: '复测与订正', checkpoint: 'retest' })
  if (lesson?.diagnosticTest) steps.push({ id: 'diagnostic', title: '诊断测评' })
  return steps
}
export function parseLearningRoute(hash: string, totalWeeks: number, subjects: SubjectId[]) {
  const match = /^#learn\/(\d+)\/([a-z]+)(?:\/([a-z0-9-]+))?$/.exec(hash)
  if (!match) return null
  const week = Number(match[1]), subject = match[2] as SubjectId
  if (!Number.isInteger(week) || week < 1 || week > totalWeeks || !subjects.includes(subject)) return null
  return { week, subject, step: match[3] || 'prepare' }
}
export function learningHash(week: number, subject: SubjectId, step = 'prepare') {
  return `#learn/${week}/${subject}/${step}`
}
