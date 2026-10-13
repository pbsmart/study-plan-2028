import type { SubjectId } from '../model'
import type { ContentReference, DiagnosticTest, KnowledgeBlock, OriginalProblem, StudyWeek, SubjectWeek } from './types'

const subjectMap: Record<string, SubjectId> = { 语文: 'chinese', 数学: 'math', 英语: 'english', 物理: 'physics', 化学: 'chemistry', 生物: 'biology', 生物学: 'biology', 地理: 'geography', 思想政治: 'politics', 政治: 'politics', chinese: 'chinese', math: 'math', english: 'english', physics: 'physics', chemistry: 'chemistry', biology: 'biology', geography: 'geography', politics: 'politics' }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown): string => typeof value === 'string' ? value : ''
const list = (value: unknown): string[] => Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string' && !!s.trim()) : typeof value === 'string' && value.trim() ? [value] : []
function solutionSteps(p: Record<string, unknown>): string[] {
  const result = list(p.steps)
  const normalize = (s: string) => s.replace(/\s+/g,' ').trim()
  for (const detail of [...list(p.explanation),...list(p.solution)]) {
    if (!result.some(step => normalize(step) === normalize(detail)) && normalize(detail) !== normalize(result.join('；'))) result.push(detail)
  }
  return result
}
function problem(value: unknown, id: string, fallbackTitle: string): OriginalProblem | null {
  const p = object(value), prompt = text(p.question || p.prompt)
  if (!prompt) return null
  if (p.sourceType && p.sourceType !== 'original') throw new Error('内置教学题必须明确为原创；往年题仅通过独立来源索引呈现。')
  const result: OriginalProblem = { id: text(p.id) || id, origin: 'original', title: text(p.title || p.label) || fallbackTitle, prompt, answer: text(p.answer), solution: solutionSteps(p), commonErrors: list(p.commonErrors) }
  for (const key of ['sourceStory', 'sourcePassage', 'sampleContinuation', 'sampleText', 'wordCountNote', 'characterCountNote'] as const) if (text(p[key])) result[key] = text(p[key])
  for (const key of ['sampleWordCount', 'passageWordCount', 'sampleCharacterCount', 'sampleCharacterCountWithPunctuation', 'characterLimit', 'points'] as const) if (typeof p[key] === 'number' && Number.isFinite(p[key]) && p[key] >= 0) result[key] = p[key]
  for (const key of ['wordRange', 'characterRange'] as const) if (Array.isArray(p[key]) && p[key].length === 2 && p[key].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) result[key] = p[key] as number[]
  result.paragraphStarters = list(p.paragraphStarters)
  result.sources = list(p.sources).filter(url => /^https?:\/\//.test(url))
  if (p.quotedSource) { const q = object(p.quotedSource); result.quotedSource = {title:text(q.title),author:text(q.author),copyrightStatus:text(q.copyrightStatus),referenceId:text(q.referenceId),text:text(q.text)} }
  if (Array.isArray(p.scoring)) result.scoring = p.scoring.map(s => { const rule = object(s); return { points: Number(rule.points), criterion: text(rule.criterion) } })
  return result
}
function diagnostic(value: unknown, id: string): DiagnosticTest | undefined {
  if (!value) return undefined
  const d = object(value)
  if (d.sourceType !== 'original' || !Array.isArray(d.questions)) throw new Error('诊断测评必须为原创且包含题目。')
  const questions = d.questions.map((q, i) => problem(q, `${id}-diagnostic-${i+1}`, `原创诊断题 ${i+1}`))
  const totalPoints = Number(d.totalPoints)
  if (!questions.length || questions.some(q => !q || !q.answer || !q.solution.length || !q.points || !q.scoring?.length || q.scoring.some(r => !Number.isFinite(r.points) || r.points < 0 || !r.criterion) || Math.abs(q.scoring.reduce((n,r) => n+r.points,0) - q.points) > 1e-8) || !Number.isFinite(totalPoints) || Math.abs(questions.reduce((n,q) => n+(q?.points || 0),0) - totalPoints) > 1e-8) throw new Error('诊断题目、答案或分值不完整。')
  return { title: text(d.title || d.label), totalPoints, scopeNote: text(d.scopeNote), instructions: list(d.instructions), questions: questions as OriginalProblem[], scoreInterpretation: list(d.scoreInterpretation), remediationMap: Object.entries(object(d.remediationMap)).map(([questionId,guidance]) => ({questionId,guidance:list(guidance)})) }
}
function contentReferences(lesson: Record<string, unknown>, root: Record<string, unknown>): ContentReference[] {
  const all = Array.isArray(root.verificationReferences) ? root.verificationReferences.map(object) : []
  const ids = [...list(lesson.referenceIds),...list(lesson.sources)]
  const linked = all.filter(r => ids.includes(text(r.id)) || r.lessonId === lesson.id || list(r.appliesTo).includes(text(lesson.id)) || list(r.usedIn).includes(text(lesson.id)) || list(r.lessonIds).includes(text(lesson.id)) || list(r.lessons).includes(text(lesson.id)))
  const direct = Array.isArray(lesson.sourceReferences) ? lesson.sourceReferences.map(object) : []
  const unique = new Map<string,ContentReference>()
  for (const r of [...direct,...linked]) {
    const url = text(r.url)
    if (/^https?:\/\//.test(url)) unique.set(url,{title:text(r.title),url,note:[...new Set([text(r.supports || r.verifiedFor || r.use || r.scopeNote || r.scope || r.verification),text(r.note),text(r.questionProvenance),text(r.versionNote)].filter(Boolean))].join('；')})
  }
  return [...unique.values()]
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
      subjects[subject] = { status: 'complete', title: text(lesson.title || outline.topic), goals: list(lesson.objectives), prerequisites: list(lesson.prerequisites), knowledge, examPoints: list(lesson.examFocus), examples: example ? [example] : [], exercises, commonErrors: list(lesson.commonErrors), retest: { tasks: list(retest.tasks || retest.question), criteria: list(lesson.mastery || retest.criteria), ...(retestProblem ? { problem: retestProblem } : {}) }, sourceIds: list(outline.pastPapers), diagnosticTest: diagnostic(lesson.diagnosticTest, `w${week}-${subject}`), trainingMode: text(lesson.trainingMode), audioStatus: text(lesson.audioStatus), listeningMasteryStatus: text(lesson.listeningMasteryStatus), materialNote: text(lesson.materialNote), trainingScope: text(lesson.trainingScope), masteryStatus: text(lesson.masteryStatus), progressionNote: text(lesson.progressionNote), writingMasteryStatus: text(lesson.writingMasteryStatus), pendingChecklist: list(lesson.pendingChecklist), safetyScope: text(lesson.safetyScope), contentReferences: contentReferences(lesson, root) }
    }
    const phase = text(w.phase), stage = phases.get(phase) || phase || '自主学习'
    return { week, title: text(w.title) || `第 ${week} 周`, stage, summary: text(w.summary || w.completionRule) || '按知识点学习、独立练习与复测推进，未学完可停留。', subjects }
  }).sort((a,b) => a.week-b.week)
}
