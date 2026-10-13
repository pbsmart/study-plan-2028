import type { StudyWeek } from './types'
import courseData from './study-plan-content-v1.json'
import { adaptCurriculum } from './adapter'

// 仅注册经过内容审核的批次；空缺不会自动生成题目或完整讲解。
export const curriculum: StudyWeek[] = adaptCurriculum(courseData)

export function getStudyWeek(week: number): StudyWeek {
  return curriculum.find(item => item.week === week) || { week, title: '课程内容待补充', stage: '待补充', summary: '本周内容尚未接入。可以保留真实学习记录，但没有提供完整讲解或题目。', subjects: {} }
}
export const totalStudyWeeks = 84
