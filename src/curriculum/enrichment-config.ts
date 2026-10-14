/** Only explicitly configured core-subject pilots are attached to a study week. */
export interface EnrichmentConfig {
  week: number
  revision: string
  directory: string
  figureManifests?: { subject: string; file: string }[]
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
]
