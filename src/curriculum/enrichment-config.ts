/** Only explicitly configured core-subject pilots are attached to a study week. */
export interface EnrichmentConfig {
  week: number
  revision: string
  directory: string
  figureManifests?: { subject: string; file: string }[]
  answerOnlyFigureIds?: string[]
  reviewMapManifests?: { subject: string; file: string }[]
  preferDiagramAssets?: boolean
  diagramQuestionLinks?: Record<string, string[]>
}
export const enrichmentConfigs: EnrichmentConfig[] = [
  { week: 1, revision: 'week01-enriched-v1', directory: 'enriched-week-01' },
  {
    week: 2, revision: 'week02-enriched-v1', directory: 'enriched-week-02',
    figureManifests: [
      { subject: 'math', file: 'assets/math-inequality-intersection.json' },
      { subject: 'chemistry', file: 'assets/chemistry-figures.json' },
    ],
    preferDiagramAssets: true,
    diagramQuestionLinks: { 'w2-physics-diagram-route': ['w2-physics-ex2'] },
  },
  {
    week: 3, revision: 'week03-enriched-v1', directory: 'enriched-week-03',
    answerOnlyFigureIds: ['w3-math-figure-interval'],
    figureManifests: [
      { subject: 'math', file: 'assets/math-figures.json' },
      { subject: 'physics', file: 'assets/physics-figures.json' },
      { subject: 'chemistry', file: 'assets/chemistry-figures.json' },
    ],
    preferDiagramAssets: true,
  },
  {
    week: 4, revision: 'week04-enriched-v1', directory: 'enriched-week-04',
    figureManifests: [
      { subject: 'math', file: 'assets/math-figures.json' },
      { subject: 'physics', file: 'assets/physics-figures.json' },
      { subject: 'chemistry', file: 'assets/chemistry-figures.json' },
    ],
    preferDiagramAssets: true,
    reviewMapManifests: [
      { subject: 'chinese', file: 'assets/chinese-review-map.json' },
      { subject: 'math', file: 'assets/math-review-map.json' },
      { subject: 'english', file: 'assets/english-review-map.json' },
      { subject: 'physics', file: 'assets/physics-review-map.json' },
      { subject: 'chemistry', file: 'assets/chemistry-review-map.json' },
    ],
  },
]
