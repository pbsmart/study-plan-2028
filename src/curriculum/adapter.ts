import type { SubjectId } from '../model'
import type { KnowledgeBlock, OriginalProblem, StudyWeek, SubjectWeek } from './types'

const subjectMap: Record<string, SubjectId> = { 语文: 'chinese', 数学: 'math', 英语: 'english', 物理: 'physics', 化学: 'chemistry', 生物: 'biology', 生物学: 'biology', 地理: 'geography', 思想政治: 'politics', 政治: 'politics', chinese: 'chinese', math: 'math', english: 'english', physics: 'physics', chemistry: 'chemistry', biology: 'biology', geography: 'geography', politics: 'politics' }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown): string => typeof value === 'string' ? value : ''
const list = (value: unknown): string[] => Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string' && !!s.trim()) : typeof value === 'string' && value.trim() ? [value] : []
function problem(value: unknown, id: string, fallbackTitle: string): OriginalProblem | null {
  const p = object(value), prompt = text(p.question || p.prompt)
  if (!prompt) return null
  if (p.sourceType && p.sourceType !== 'original') throw new Error('内置教学题必须明确为原创；往年题仅通过独立来源索引呈现。')
  return { id: text(p.id) || id, origin: 'original', title: text(p.title || p.label) || fallbackTitle, prompt, answer: text(p.answer), solution: list(p.steps || p.explanation || p.solution) }
}
export function adaptCurriculum(input: unknown): StudyWeek[] {
  const root = object(input)
  if (root.dateBinding === true || (root.scheduleMode && root.scheduleMode !== 'manual-week')) throw new Error('课程必须采用 manual-week，不能绑定日历日期。')
  if (!Array.isArray(root.weeks) || !Array.isArray(root.lessons)) throw new Error('课程缺少 weeks 或 lessons 数组。')
  const detailed = root.lessons.map(object)
  const weekNumbers = new Set<number>()
  const phases = new Map<string, string>()
  if (Array.isArray(root.phases)) root.phases.map(object).forEach(p => { const name = text(p.title || p.name); if (name) phases.set(text(p.id || p.key), name) })
  return root.weeks.map(raw => {
    const w = object(raw), week = Number(w.week)
    if (!Number.isInteger(week) || week < 1 || week > 84 || weekNumbers.has(week)) throw new Error('课程周编号须为 1—84 的唯一整数。')
    weekNumbers.add(week)
    const subjects: Partial<Record<SubjectId, SubjectWeek>> = {}
    for (const [key, value] of Object.entries(object(w.subjects))) {
      const subject = subjectMap[key]
      if (!subject) throw new Error(`未知学科键：${key}`)
      const outline = object(value)
      const lesson = detailed.find(l => Number(l.week) === week && subjectMap[text(l.subject)] === subject)
      if (!lesson) { subjects[subject] = { status: text(outline.detailStatus).includes('待') ? 'pending' : 'outline', title: text(outline.topic || outline.title), goals: list(outline.objectives || outline.topic), prerequisites: [], knowledge: [], examPoints: [], examples: [], exercises: [], retest: { tasks: [], criteria: [] }, sourceIds: list(outline.pastPapers) }; continue }
      const knowledge: KnowledgeBlock[] = Array.isArray(lesson.knowledge) ? lesson.knowledge.map(k => { const block = object(k); return { title: text(block.title), paragraphs: list(block.explanation || block.paragraphs), keyPoints: list(block.keyPoints) } }) : []
      const example = problem(lesson.workedExample, `w${week}-${subject}-ex1`, '基础例题')
      const exercises = Array.isArray(lesson.practice) ? lesson.practice.map((p, i) => problem(p, `w${week}-${subject}-pr${i+1}`, `独立练习 ${i+1}`)).filter((p): p is OriginalProblem => !!p) : []
      const retest = object(lesson.retest), retestProblem = problem(retest, `w${week}-${subject}-retest`, '复测题')
      subjects[subject] = { status: 'complete', title: text(lesson.title || outline.topic), goals: list(lesson.objectives), prerequisites: list(lesson.prerequisites), knowledge, examPoints: list(lesson.examFocus), examples: example ? [example] : [], exercises, commonErrors: list(lesson.commonErrors), retest: { tasks: list(retest.tasks || retest.question), criteria: list(lesson.mastery || retest.criteria), ...(retestProblem ? { problem: retestProblem } : {}) }, sourceIds: list(outline.pastPapers) }
    }
    const phase = text(w.phase), stage = phases.get(phase) || phase || '自主学习'
    return { week, title: text(w.title) || `第 ${week} 周`, stage, summary: text(w.summary || w.completionRule) || '按知识点学习、独立练习与复测推进，未学完可停留。', subjects }
  }).sort((a,b) => a.week-b.week)
}
