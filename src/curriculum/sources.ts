import sourceIndex from './past-paper-sources.json'
import type { SubjectId } from '../model'
import type { PastPaperSource } from './types'

export const sourceScope = sourceIndex.scopeNote
export const pastPaperSources: PastPaperSource[] = sourceIndex.sources.map(source => ({ ...source, kind: 'official-analysis', scopeNote: '官方评析索引，未提供或核验原题全文与完整答案。' }))
const sourceSubject: Partial<Record<SubjectId, string>> = { chinese: '语文', math: '数学', english: '英语', physics: '物理', chemistry: '化学', biology: '生物学', geography: '地理', politics: '思想政治' }
export function sourcesForSubject(subject: SubjectId, sourceIds?: string[]): PastPaperSource[] {
  const selected = sourceSubject[subject] || ''
  return pastPaperSources.filter(source => source.subject?.split('、').includes(selected) && (!source.items?.some(item => item.subject) || source.items.some(item => item.subject === selected)) && (!sourceIds?.length || sourceIds.includes(source.id)))
}
