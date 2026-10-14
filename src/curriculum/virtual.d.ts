declare module 'virtual:study-curriculum' {
  export const curriculum: import('./summary-types').StudyWeekSummary[]
  export const curriculumCoverage: import('./coverage').CurriculumCoverage
  export const weekLoaders: Record<number, () => Promise<{ default: unknown }>>
}
