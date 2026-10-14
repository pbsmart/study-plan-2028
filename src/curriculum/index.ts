import { curriculum, curriculumCoverage, weekLoaders } from 'virtual:study-curriculum'
import { createStudyWeekLoader } from './loader'
import type { StudyWeekSummary } from './summary-types'

export { curriculum, curriculumCoverage }
export { summarizeCoverage } from './coverage'
export { CurriculumLoadError } from './loader'
export type { StudyWeekSummary, SubjectWeekSummary } from './summary-types'

// Synchronous navigation metadata. Use loadStudyWeek for lesson bodies.
export function getStudyWeek(week: number): StudyWeekSummary {
  return curriculum.find(item => item.week === week) || { week, title: '课程内容待补充', stage: '待补充', summary: '本周内容尚未接入。可以保留真实学习记录，但没有提供完整讲解或题目。', subjects: {} }
}
export const totalStudyWeeks = 84
export const { loadStudyWeek, peekStudyWeek } = createStudyWeekLoader(curriculum, weekLoaders)
