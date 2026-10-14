export interface EnrichedQuestion {
  id: string; title: string; origin: 'original'; level: 'core' | 'extension'
  difficulty: 'foundation' | 'application' | 'transfer'; prompt: string; answer: string
  steps: string[]; commonErrors: string[]; estimatedMinutes: number
  points?: number; scoring?: { points: number; criterion: string }[]
}
export interface EnrichedSection {
  id: string; title: string; level: 'core' | 'remediation' | 'extension'
  paragraphs: string[]; keyPoints: string[]
  checkpoint: { question: string; answer: string; explanation: string }
}
export interface LessonDiagram {
  id: string; title: string; kind: 'number-line'; description: string; altText: string
  axis: { unit: string; positiveDirection: string; min: number; max: number; ticks: number[] }
  points: { label: string; x: number }[]
  route: { from: number; to: number; label: string }[]
  displacement: { from: number; to: number; label: string }
  linkedSectionIds: string[]; asset?: string
}
export interface EnrichedLesson {
  id: string; week: number; subject: string; title: string; revision: string; status: string
  objectives: string[]; prerequisites: string[]
  budget: { coreMinutes: number; busyMinutes: number; extensionMinutes: number; busyPolicy: string; segments: { id: string; title: string; minutes: number; activityIds: string[] }[] }
  diagnostic: { instructions: string; questions: EnrichedQuestion[]; routes: { when: string; action: string; sectionIds: string[] }[] }
  sections: EnrichedSection[]; workedExamples: EnrichedQuestion[]; practice: EnrichedQuestion[]
  misconceptions: { wrong: string; why: string; right: string }[]
  quiz: { instructions: string; totalPoints: number; questions: EnrichedQuestion[]; passRule: { minScore: number; requiredChecks: string[] }; remediation: { questionIds: string[]; sectionIds: string[]; action: string }[] }
  mastery: string[]; nextStep: string
  sourcePolicy: { authorship: string; examStatus: string; externalSources: { id: string; title: string; url: string; kind: 'reference' | 'public-domain-text'; scopeNote: string }[] }
  audioStatus?: string; safetyScope?: string
  reviewActivity?: { id: string; title: string; instructions: string[] }
  diagrams?: LessonDiagram[]
}

/** Compiled image metadata, kept separate from the immutable lesson overlay. */
export interface StaticLessonFigure {
  id: string; title: string; src: string; altText: string; caption: string
  linkedSectionIds: string[]; linkedQuestionIds: string[]
  width: number; height: number
}
