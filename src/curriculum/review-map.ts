import type { CumulativeReviewMap, EnrichedLesson } from './enriched-types'

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const fail = () => new Error('累计诊断映射与本周课程不一致。')
const record = (value: unknown) => { if (!object(value)) throw fail(); return value }
const records = (value: unknown) => { if (!Array.isArray(value) || !value.length) throw fail(); return value.map(record) }
const positive = (value: unknown) => { if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw fail(); return value }

/** Compile four authoring shapes without mutating frozen source data or adding assessments. */
export function normalizeReviewMap(raw: unknown, lesson: EnrichedLesson): CumulativeReviewMap {
  const value = record(raw)
  if (value.week !== lesson.week || (value.lessonId !== undefined && value.lessonId !== lesson.id)) throw fail()
  const totalPoints = positive(value.totalPoints ?? value.quizTotalPoints)
  const minutes = positive(value.minutes ?? value.quizMinutes ?? value.estimatedMinutes)
  if (totalPoints !== lesson.quiz.totalPoints) throw fail()
  const sections = new Set(lesson.sections.map(section => section.id))
  const physics = value.quizTotalPoints !== undefined
  const chemistry = value.questions !== undefined
  const grouped = new Map<string, { header: Record<string, unknown>; rows: Record<string, unknown>[] }>()
  for (const entry of records(chemistry ? value.questions : value.scoringMap)) {
    if (typeof entry.questionId !== 'string') throw fail()
    if (physics) {
      const group = grouped.get(entry.questionId) || { header: {}, rows: [] }
      group.rows.push(entry); grouped.set(entry.questionId, group)
    } else {
      if (grouped.has(entry.questionId)) throw fail()
      grouped.set(entry.questionId, { header: entry, rows: records(chemistry ? entry.scoringPointMap : entry.skills) })
    }
  }
  if (grouped.size !== lesson.quiz.questions.length) throw fail()
  const questions = lesson.quiz.questions.map(question => {
    const group = grouped.get(question.id)
    if (!group || (group.header.points !== undefined && group.header.points !== question.points)) throw fail()
    const indexes = new Set<number>()
    const skills = group.rows.map(row => {
      const points = positive(row.points)
      if (typeof row.skill !== 'string' || !row.skill.trim()) throw fail()
      const weeks = chemistry ? [row.primaryWeek, ...(Array.isArray(row.supportingWeeks) ? row.supportingWeeks : [])] : row.weeks
      if (!Array.isArray(weeks) || !weeks.length || weeks.some(week => !Number.isInteger(week) || week < 1 || week > lesson.week)) throw fail()
      if (row.primaryWeek !== undefined && !weeks.includes(row.primaryWeek)) throw fail()
      const ids = row.remediationSectionIds ?? row.sectionIds ?? group.header.remediationSectionIds
      if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !sections.has(id))) throw fail()
      // Physics uses one-based rubric indices; language and chemistry use zero-based indices.
      // Mathematics deliberately groups rubric rows, so no index is fabricated.
      if (row.scoringIndex !== undefined) {
        if (typeof row.scoringIndex !== 'number' || !Number.isInteger(row.scoringIndex)) throw fail()
        const index = row.scoringIndex - (physics ? 1 : 0), rubric = question.scoring?.[index]
        if (indexes.has(index) || !rubric || rubric.points !== points || (row.criterion !== undefined && row.criterion !== rubric.criterion)) throw fail()
        indexes.add(index)
      }
      return { skill: row.skill, points, weeks: [...new Set(weeks)] as number[], sectionIds: [...new Set(ids)] as string[] }
    })
    if (skills.reduce((sum, skill) => sum + skill.points, 0) !== question.points) throw fail()
    if (indexes.size && indexes.size !== question.scoring?.length) throw fail()
    return { questionId: question.id, title: question.title, points: question.points!, skills }
  })
  if (questions.reduce((sum, question) => sum + question.points, 0) !== totalPoints) throw fail()
  // A map describes the existing quiz budget, never a second test or additional time.
  const quizIds = new Set(lesson.quiz.questions.map(question => question.id))
  const quizSegments = lesson.budget.segments.filter(segment => segment.activityIds.some(id => quizIds.has(id)))
  if (quizSegments.reduce((sum, segment) => sum + segment.minutes, 0) !== minutes || ![...quizIds].every(id => quizSegments.some(segment => segment.activityIds.includes(id)))) throw fail()
  return { totalPoints, minutes, questions }
}
