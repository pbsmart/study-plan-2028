import { describe, expect, it, vi } from 'vitest'
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { curriculum, curriculumCoverage, getStudyWeek, loadStudyWeek, totalStudyWeeks } from '../src/curriculum'
import { adaptCurriculum } from '../src/curriculum/adapter'
import { createStudyWeekLoader, CurriculumLoadError } from '../src/curriculum/loader'
import { readCurriculumData } from '../src/curriculum/vite-plugin'
import type { StudyWeek } from '../src/curriculum/types'
import type { StudyWeekSummary } from '../src/curriculum/summary-types'

const summary: StudyWeekSummary = { week: 1, title: '第一周', stage: '基础', summary: '简介', subjects: {} }
const detail: StudyWeek = { ...summary, subjects: {} }

describe('lazy curriculum loading', () => {
  it('keeps route metadata complete without lesson bodies', () => {
    expect(curriculum.map(week => week.week)).toEqual(Array.from({ length: totalStudyWeeks }, (_, index) => index + 1))
    expect(curriculumCoverage.completeWeeks).toHaveLength(84)
    expect(curriculumCoverage.completeLessons).toBe(672)
    expect(curriculumCoverage.originalQuestions).toBe(2688)
    expect(curriculumCoverage.diagnosticQuestions).toBe(96)
    for (const week of curriculum) {
      expect(Object.keys(week.subjects)).toHaveLength(8)
      for (const lesson of Object.values(week.subjects)) {
        expect(lesson!.title).not.toBe('')
        expect(lesson!.status).toBe('complete')
        expect(lesson).not.toHaveProperty('knowledge')
        expect(lesson).not.toHaveProperty('examples')
      }
      expect(getStudyWeek(week.week)).toBe(week)
    }
    expect(getStudyWeek(0).subjects).toEqual({})
  })
  it('loads all 84 weeks without losing or changing any baseline field', async () => {
    const source = JSON.parse(await readFile(new URL('../src/curriculum/study-plan-content-v1.json', import.meta.url), 'utf8'))
    const baseline = JSON.parse(JSON.stringify(adaptCurriculum(source))) as StudyWeek[]
    for (const expected of baseline) {
      const actual = await loadStudyWeek(expected.week)
      expect(actual).toMatchObject(expected)
      expect(Object.keys(actual.subjects)).toEqual(Object.keys(expected.subjects))
      if (![1, 2, 3, 4, 5, 6, 7, 8].includes(expected.week)) expect(actual).toEqual(expected)
    }
  })
  it('does not import until requested and deduplicates in-flight and completed requests', async () => {
    const importer = vi.fn(async () => ({ default: detail }))
    const loader = createStudyWeekLoader([summary], { 1: importer })
    expect(importer).not.toHaveBeenCalled()
    expect(loader.peekStudyWeek(1)).toBeUndefined()
    const first = loader.loadStudyWeek(1), second = loader.loadStudyWeek(1)
    expect(first).toBe(second)
    expect(await first).toBe(detail)
    expect(await loader.loadStudyWeek(1)).toBe(detail)
    expect(loader.peekStudyWeek(1)).toBe(detail)
    expect(importer).toHaveBeenCalledTimes(1)
  })
  it.each([0, 85, 1.5, NaN, Infinity])('rejects invalid week %s without importing', async week => {
    const importer = vi.fn(async () => ({ default: detail }))
    const loader = createStudyWeekLoader([summary], { 1: importer })
    await expect(loader.loadStudyWeek(week)).rejects.toMatchObject({ code: 'invalid-week', name: 'CurriculumLoadError' })
    expect(importer).not.toHaveBeenCalled()
  })
  it('rejects an unpublished week distinctly from a network failure', async () => {
    const loader = createStudyWeekLoader([summary], {})
    await expect(loader.loadStudyWeek(1)).rejects.toMatchObject({ week: 1, code: 'unavailable' })
  })
  it('clears failed requests and permits an explicit retry after synchronous or asynchronous failures', async () => {
    const importer = vi.fn().mockImplementationOnce(() => { throw new Error('offline') }).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: detail })
    const loader = createStudyWeekLoader([summary], { 1: importer })
    await expect(loader.loadStudyWeek(1)).rejects.toMatchObject({ code: 'load-failed', message: expect.stringContaining('重试') })
    expect(loader.peekStudyWeek(1)).toBeUndefined()
    await expect(loader.loadStudyWeek(1)).rejects.toBeInstanceOf(CurriculumLoadError)
    expect(await loader.loadStudyWeek(1)).toBe(detail)
    expect(importer).toHaveBeenCalledTimes(3)
  })
  it.each([null, {}, { ...detail, week: 2 }, { ...detail, subjects: { math: {} } }])('rejects malformed/mismatched chunks without caching them', async invalid => {
    const importer = vi.fn().mockResolvedValueOnce({ default: invalid }).mockResolvedValue({ default: detail })
    const loader = createStudyWeekLoader([summary], { 1: importer })
    await expect(loader.loadStudyWeek(1)).rejects.toMatchObject({ code: 'invalid-content' })
    expect(loader.peekStudyWeek(1)).toBeUndefined()
    expect(await loader.loadStudyWeek(1)).toBe(detail)
  })
  it('isolates concurrent requests for different weeks and does not substitute late content', async () => {
    const secondSummary = { ...summary, week: 2 }, secondDetail = { ...detail, week: 2 }
    let resolveFirst!: (value: { default: StudyWeek }) => void
    const loader = createStudyWeekLoader([summary, secondSummary], {
      1: () => new Promise(resolve => { resolveFirst = resolve }),
      2: async () => ({ default: secondDetail }),
    })
    const first = loader.loadStudyWeek(1)
    expect(await loader.loadStudyWeek(2)).toBe(secondDetail)
    resolveFirst({ default: detail })
    expect(await first).toBe(detail)
    expect(loader.peekStudyWeek(2)).toBe(secondDetail)
  })
})

describe('optional week-one enrichment compilation', () => {
  it('attaches optional enrichment only to week one while retaining original coverage and detail', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'curriculum-enrichment-'))
    const enrichment = {
      id: 'w1-数学', week: 1, subject: '数学', title: '第1周数学深化试点', revision: 'week01-enriched-v1', status: 'pilot-ready',
      objectives: ['目标'], prerequisites: ['前置'], mastery: ['独立核对'], nextStep: '继续学习',
      budget: { coreMinutes: 240 }, diagnostic: { questions: [] }, quiz: { questions: [] }, sourcePolicy: { authorship: '原创' },
      sections: [{ title: '深化内容', paragraphs: ['只属于第一周的试点正文。'] }],
      workedExamples: [{ prompt: '例题' }], practice: [{ prompt: '练习' }], misconceptions: [{ wrong: '易错点' }],
    }
    try {
      const baseline = await readCurriculumData({ enrichmentDirectory: join(directory, 'absent') })
      await writeFile(join(directory, 'math.json'), JSON.stringify(enrichment))
      const result = await readCurriculumData({ enrichmentDirectory: directory })
      expect(result.coverage).toEqual(baseline.coverage)
      expect(result.weeks[0]!.subjects.math).toMatchObject(baseline.weeks[0]!.subjects.math!)
      expect(result.weeks[0]!.subjects.math).toHaveProperty('enrichment', enrichment)
      expect(result.summaries[0]!.subjects.math).toHaveProperty('enrichmentTitle', enrichment.title)
      expect(result.weeks.slice(1)).toEqual(baseline.weeks.slice(1))
      for (const [subject, lesson] of Object.entries(result.weeks[0]!.subjects)) if (subject !== 'math') expect(lesson).not.toHaveProperty('enrichment')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('tolerates a missing directory and fails loudly on malformed or misrouted data', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'curriculum-enrichment-'))
    const overlay = join(directory, 'overlay')
    try {
      expect((await readCurriculumData({ enrichmentDirectory: overlay })).weeks).toHaveLength(84)
      await mkdir(overlay)
      await writeFile(join(overlay, 'math.json'), '{broken')
      await expect(readCurriculumData({ enrichmentDirectory: overlay })).rejects.toThrow()
      await writeFile(join(overlay, 'math.json'), JSON.stringify({ week: 2, subject: '数学' }))
      await expect(readCurriculumData({ enrichmentDirectory: overlay })).rejects.toThrow('深化文件无效')
      await rm(join(overlay, 'math.json'))
      await writeFile(join(overlay, 'biology.json'), '{}')
      await expect(readCurriculumData({ enrichmentDirectory: overlay })).rejects.toThrow('未知第1周深化学科文件')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
