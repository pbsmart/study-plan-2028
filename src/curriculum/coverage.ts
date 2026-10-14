import type { StudyWeek } from './types'
import { effectiveStatus } from './types'

// Build-time coverage comes from actual adapted content, not outline labels.
export function summarizeCoverage(weeks: StudyWeek[]) {
  const lessons = weeks.flatMap(w => Object.values(w.subjects))
  return {
    completeLessons: lessons.filter(l => effectiveStatus(l) === 'complete').length,
    originalQuestions: lessons.reduce((n, l) => n + (l?.examples.length || 0) + (l?.exercises.length || 0) + (l?.retest.problem ? 1 : 0), 0),
    diagnosticQuestions: lessons.reduce((n, l) => n + (l?.diagnosticTest?.questions.length || 0), 0),
    outlineLessons: lessons.filter(l => effectiveStatus(l) === 'outline').length,
    pendingLessons: lessons.filter(l => effectiveStatus(l) === 'pending').length,
    completeWeeks: weeks.filter(w => Object.keys(w.subjects).length === 8 && Object.values(w.subjects).every(l => effectiveStatus(l) === 'complete')).map(w => w.week),
  }
}
export type CurriculumCoverage = ReturnType<typeof summarizeCoverage>
