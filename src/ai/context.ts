import type { OriginalProblem, SubjectWeek } from '../curriculum/types'

export interface LearningContext { id: string; label: string; text: string }
export const MAX_CONTEXT_LENGTH = 12000

/** Explicit allowlist: no answers, scoring, learner records, or whole-lesson JSON. */
export function learningContexts(lesson: SubjectWeek | undefined, step: string, week: number, subject: string): LearningContext[] {
  if (!lesson) return []
  const prefix = `第 ${week} 周 · ${subject}\n${lesson.enrichment?.title || lesson.title}`
  const item = (id: string, label: string, lines: string[]): LearningContext => ({ id, label, text: `${prefix}\n${label}\n\n${lines.filter(Boolean).join('\n\n')}` })
  const problem = (p: Pick<OriginalProblem, 'id' | 'title' | 'prompt'> & Partial<OriginalProblem>) => item(p.id, p.title, [
    ...new Set([p.sourceStory || '', p.sourcePassage || '', p.quotedSource?.text || ''].filter(text => text && !p.prompt.includes(text))),
    p.prompt, ...(p.paragraphStarters || []).filter(text => !p.prompt.includes(text)),
    p.wordRange?.length ? `词数范围：${p.wordRange.join('–')}` : '',
    p.characterRange?.length ? `汉字数范围：${p.characterRange.join('–')}` : '',
    p.characterLimit !== undefined ? `长度上限：${p.characterLimit} 字` : '',
  ])
  const enriched = lesson.enrichment
  let options: LearningContext[] = []
  if (enriched) {
    const section = enriched.sections.find(section => section.id === step)
    const question = [...enriched.workedExamples, ...enriched.practice].find(question => question.id === step)
    if (section) options = [item(section.id, section.title, [...section.paragraphs, ...section.keyPoints, `自检问题：${section.checkpoint.question}`])]
    else if (question) options = [problem(question)]
    else if (step === 'diagnostic') options = enriched.diagnostic.questions.map(problem)
    else if (step === 'quiz') options = enriched.quiz.questions.map(problem)
  } else {
    if (step === 'knowledge') options = lesson.knowledge.map((block, i) => item(`knowledge-${i}`, block.title, [...block.paragraphs, ...(block.keyPoints || [])]))
    else if (step === 'examples') options = lesson.examples.map(problem)
    else if (step === 'practice') options = lesson.exercises.map(problem)
    else if (step === 'retest' && lesson.retest.problem) options = [problem(lesson.retest.problem)]
    else if (step === 'diagnostic') options = (lesson.diagnosticTest?.questions || []).map(problem)
  }
  // Truncation is visible in exactly the preview that will be sent.
  return options.map(option => ({ ...option, text: option.text.length > MAX_CONTEXT_LENGTH ? `${option.text.slice(0, MAX_CONTEXT_LENGTH - 24)}\n[资料过长，后文未附带]` : option.text }))
}
