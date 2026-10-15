import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App.vue'
import FocusLesson from '../src/components/FocusLesson.vue'
import LearningAiDialog from '../src/components/LearningAiDialog.vue'
import { loadStudyWeek } from '../src/curriculum'
import integrity from './fixtures/ui-refresh-integrity.json'
import podcastIntegrity from './fixtures/podcast-integration-integrity.json'
import redesignIntegrity from './fixtures/ui-redesign-integrity.json'

const root = fileURLToPath(new URL('..', import.meta.url))
const sourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name)
  return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.css') ? [] : [relative(root, path).replaceAll('\\', '/')]
}).sort()
const additiveCurriculum = (path: string) => /^src\/curriculum\/enriched-week-(?:09|10|11|12)\//.test(path)
const updatedConfig = 'src/curriculum/enrichment-config.ts'
// Only these two scripts have a new, explicit podcast baseline.
const podcastScripts: Record<string, { sha256: string; scriptSha256?: string }> = { ...podcastIntegrity.files, ...redesignIntegrity.files }
const redesignAdded = (path: string) => path === 'src/notebook.ts' || /^src\/components\/(?:ProblemSequence|StudyNotebook)\.vue$/.test(path)
const podcastAdded = (path: string) => path.startsWith('src/podcast/') || /^src\/components\/(?:LessonPodcast|PodcastControls|PodcastHost)\.vue$/.test(path)
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const digest = (content: string) => createHash('sha256').update(content).digest('hex')
const basic = (await loadStudyWeek(13)).subjects.math!
const enriched = (await loadStudyWeek(1)).subjects.math!
const cumulative = (await loadStudyWeek(8)).subjects.math!
const renderFocus = (lesson: typeof basic, step: string, week = 13) => renderToString(createSSRApp(FocusLesson, { week, subject: 'math', subjectLabel: '数学', lesson, step, completed: [] }))

afterEach(() => vi.unstubAllGlobals())

describe('project-wide UI-only refresh invariants', () => {
  it('preserves all baseline curriculum, figures, business modules and Vue script blocks', () => {
    expect(integrity.baselineCommit).toBe('3b66fff23ce9918bd6998bb93e4536d1ad65b5ed')
    // These additive weeks and the explicit config addition are independently guarded by weeks-nine-ten-integration and weeks-eleven-twelve-integration.
    expect(sourceFiles(join(root, 'src')).filter(path => !additiveCurriculum(path) && !podcastAdded(path) && !redesignAdded(path))).toEqual(Object.keys(integrity.files).sort())
    for (const [path, expected] of Object.entries(integrity.files)) {
      if (path === updatedConfig) continue
      const source = read(path)
      const descriptor = expected.kind === 'vue-scripts' ? parse(source).descriptor : undefined
      const content = descriptor ? JSON.stringify({ script: descriptor.script?.content || '', scriptSetup: descriptor.scriptSetup?.content || '' }) : source
      expect(digest(content), `${path}: business/data changes need a separate reviewed change, not a UI refresh`).toBe(podcastScripts[path]?.scriptSha256 || expected.sha256)
    }
  })

  it('renders one main title and gives the real current course priority over statistics', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
    vi.stubGlobal('document', { documentElement: { dataset: {}, style: {} }, querySelector: () => null })
    const html = await renderToString(createSSRApp(App))
    expect(html.match(/<main\b/g)).toHaveLength(1)
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain('aria-label="主导航"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('aria-labelledby="current-course-title"')
    expect(html).toContain('继续第 1 周')
    expect(html.indexOf('class="hero"')).toBeLessThan(html.indexOf('class="stats-grid"'))
    expect(html.indexOf('course-grid')).toBeLessThan(html.indexOf('class="stats-grid"'))
    expect(html).toMatch(/<details class="support-details coverage-details"><summary>内容范围与来源说明<\/summary>/)
    expect(html).not.toContain('[object Object]')
  })

  it('keeps all six page branches and places the weekly learning entry before progress and logs', () => {
    const template = parse(read('src/App.vue')).descriptor.template!.content
    for (const page of ['overview', 'roadmap', 'subjects', 'first', 'weekly', 'settings']) expect(template).toContain(`page === '${page}'`)
    expect(template.indexOf('class="panel study-entry"')).toBeLessThan(template.indexOf('class="week-management"'))
    expect(template.indexOf('class="panel study-entry"')).toBeLessThan(template.indexOf('class="record-section"'))
    expect(template).toContain('aria-label="浏览学习周"')
    expect(template).toContain('aria-label="课程科目"')
  })

  it('keeps lesson navigation and AI secondary to one focused, labelled reading section', async () => {
    const html = await renderFocus(basic, 'knowledge')
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html.match(/class="focus-section"/g)).toHaveLength(1)
    expect(html).toContain('aria-labelledby="focus-step-knowledge"')
    expect(html).toContain('tabindex="-1" class="focus-section-title"')
    expect(html).toContain('aria-label="课内上一节与下一节"')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).not.toMatch(/class="[^"]*primary[^"]*"[^>]*>问 AI/)
    expect(html).not.toMatch(/<details[^>]*\bopen/)
    expect(html).not.toContain('record-section')
    for (const item of basic.knowledge) expect(html).toContain(item.title)
  })

  it('retains basic and enriched exercise prompts, closed solutions, and honest cumulative assessment', async () => {
    const practice = await renderFocus(basic, 'practice')
    expect(practice.match(/class="problem-card"/g)).toHaveLength(basic.exercises.length)
    expect(practice).toContain('完成后核对答案与解析')
    expect(practice).toContain('我已实际完成练习与订正')
    expect(practice).not.toMatch(/<details[^>]*\bopen/)
    const section = enriched.enrichment!.sections[0]!
    const lesson = await renderFocus(enriched, section.id, 1)
    expect(lesson).toContain('停一停，自己试着说清楚')
    expect(lesson).toContain('想好后核对')
    expect(lesson).not.toMatch(/<details[^>]*\bopen/)
    const quiz = await renderFocus(cumulative, 'quiz', 8)
    expect(quiz).toContain('20 分')
    expect(quiz).toContain('页面不提供自动评分')
    expect(quiz.match(/class="problem-card"/g)).toHaveLength(cumulative.enrichment!.quiz.questions.length)
    expect(quiz).not.toMatch(/<details[^>]*\bopen/)
  })

  it('retains the AI privacy, request preview and explicit-submit semantics in its teleported dialog', async () => {
    const context: { teleports?: Record<string, string> } = {}
    await renderToString(createSSRApp(LearningAiDialog, { lesson: basic, week: 13, subject: 'math', subjectLabel: '数学', step: 'knowledge', stepTitle: '知识讲解' }), context)
    const html = context.teleports?.body || ''
    expect(html).toContain('aria-labelledby="learning-ai-title"')
    expect(html).toContain('aria-describedby="learning-ai-description"')
    expect(html).toContain('type="password"')
    expect(html).toContain('autocomplete="off"')
    expect(html).toContain('你的问题')
    expect(html).toContain('附带的学习资料（可选）')
    expect(html).toContain('aria-label="本次发送预览"')
    expect(html).toContain('逐条查看本次完整发送内容')
    expect(html).toContain('发送给 DeepSeek')
    expect(html).toContain('明文存储')
    expect(html).toContain('不进入学习备份')
    expect(html).toContain('form="learning-ai-form"')
    expect(html.indexOf('ai-question-panel')).toBeLessThan(html.indexOf('ai-settings'))
    expect(html.indexOf('ai-send-row')).toBeLessThan(html.indexOf('ai-conversation-section'))
  })
})
