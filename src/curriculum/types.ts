import type { SubjectId } from '../model'
import type { CumulativeReviewMap, EnrichedLesson, StaticLessonFigure } from './enriched-types'

export type ContentStatus = 'complete' | 'outline' | 'pending'
export interface KnowledgeBlock { title: string; paragraphs: string[]; keyPoints?: string[] }
export interface OriginalProblem {
  id: string
  origin: 'original'
  title: string
  prompt: string
  answer: string
  solution: string[]
  commonErrors?: string[]
  sourceStory?: string
  sourcePassage?: string
  paragraphStarters?: string[]
  sampleContinuation?: string
  sampleText?: string
  sampleWordCount?: number
  passageWordCount?: number
  sampleCharacterCount?: number
  sampleCharacterCountWithPunctuation?: number
  wordCountNote?: string
  characterCountNote?: string
  sources?: string[]
  quotedSource?: { title: string; author: string; copyrightStatus: string; referenceId: string; text: string }
  wordRange?: number[]
  characterRange?: number[]
  characterLimit?: number
  points?: number
  scoring?: { points: number; criterion: string }[]
}
export interface DiagnosticTest {
  title: string
  totalPoints: number
  scopeNote: string
  instructions: string[]
  questions: OriginalProblem[]
  scoreInterpretation: string[]
  remediationMap: { questionId: string; guidance: string[] }[]
}
export interface ContentReference { title: string; url: string; note: string }

export interface SubjectWeek {
  enrichment?: EnrichedLesson
  enrichmentFigures?: StaticLessonFigure[]
  enrichmentReviewMap?: CumulativeReviewMap
  status: ContentStatus
  title: string
  goals: string[]
  prerequisites: string[]
  knowledge: KnowledgeBlock[]
  examPoints: string[]
  examples: OriginalProblem[]
  exercises: OriginalProblem[]
  commonErrors?: string[]
  retest: { tasks: string[]; criteria: string[]; problem?: OriginalProblem }
  sourceIds: string[]
  diagnosticTest?: DiagnosticTest
  trainingMode?: string
  audioStatus?: string
  listeningMasteryStatus?: string
  materialNote?: string
  trainingScope?: string
  masteryStatus?: string
  progressionNote?: string
  writingMasteryStatus?: string
  pendingChecklist?: string[]
  safetyScope?: string
  contentReferences?: ContentReference[]
}
export interface StudyWeek {
  week: number
  title: string
  stage: string
  summary: string
  subjects: Partial<Record<SubjectId, SubjectWeek>>
}
export interface PastPaperSource {
  id: string
  kind: 'past-paper' | 'official-analysis' | 'reference'
  title: string
  year: number
  paper: string
  publisher: string
  url: string
  question?: string
  scopeNote: string
  subject?: string
  foundationUse?: string
  items?: { number: string; topic: string; subject?: string; prerequisites?: string[] }[]
}
export const statusNames: Record<ContentStatus, string> = { complete: '完整讲解', outline: '仅有周纲', pending: '待补充' }
export function effectiveStatus(lesson?: SubjectWeek): ContentStatus {
  if (!lesson || lesson.status === 'pending') return 'pending'
  if (lesson.status === 'complete' && lesson.goals.length && lesson.prerequisites.length && lesson.knowledge.some(k => k.paragraphs.length) && lesson.examPoints.length && lesson.examples.length && lesson.examples.every(p => p.prompt && p.answer && p.solution.length) && lesson.exercises.length && lesson.exercises.every(p => p.prompt && p.answer && p.solution.length) && lesson.retest.tasks.length && lesson.retest.criteria.length) return 'complete'
  return 'outline'
}
