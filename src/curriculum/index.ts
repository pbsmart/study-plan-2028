import type { StudyWeek } from './types'
import { effectiveStatus } from './types'
import courseJson from './study-plan-content-v1.json?raw'
import { adaptCurriculum } from './adapter'

// 仅注册经过内容审核的批次；空缺不会自动生成题目或完整讲解。
export const curriculum: StudyWeek[] = adaptCurriculum(JSON.parse(courseJson))

export function getStudyWeek(week: number): StudyWeek {
  return curriculum.find(item => item.week === week) || { week, title: '课程内容待补充', stage: '待补充', summary: '本周内容尚未接入。可以保留真实学习记录，但没有提供完整讲解或题目。', subjects: {} }
}
export const totalStudyWeeks = 84

// Derive public coverage from rendered content, including non-contiguous future batches.
export function summarizeCoverage(weeks: StudyWeek[]) {
  const lessons = weeks.flatMap(w => Object.values(w.subjects))
  return {
    completeLessons: lessons.filter(l => effectiveStatus(l) === 'complete').length,
    originalQuestions: lessons.reduce((n,l) => n+(l?.examples.length || 0)+(l?.exercises.length || 0)+(l?.retest.problem?1:0),0),
    diagnosticQuestions: lessons.reduce((n,l) => n+(l?.diagnosticTest?.questions.length || 0),0),
    outlineLessons: lessons.filter(l => effectiveStatus(l) === 'outline').length,
    pendingLessons: lessons.filter(l => effectiveStatus(l) === 'pending').length,
    completeWeeks: weeks.filter(w => Object.keys(w.subjects).length === 8 && Object.values(w.subjects).every(l => effectiveStatus(l) === 'complete')).map(w => w.week),
  }
}
export const curriculumCoverage = summarizeCoverage(curriculum)
