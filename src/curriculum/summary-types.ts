import type { SubjectId } from '../model'
import type { ContentStatus } from './types'

export interface SubjectWeekSummary { title: string; status: ContentStatus; enrichmentTitle?: string }
export interface StudyWeekSummary {
  week: number
  title: string
  stage: string
  summary: string
  subjects: Partial<Record<SubjectId, SubjectWeekSummary>>
}
