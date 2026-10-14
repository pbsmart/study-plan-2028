import { afterEach, describe, expect, it, vi } from 'vitest'
import { AI_KEY_STORAGE, askDeepSeek, createRequestBody, DEEPSEEK_ENDPOINT, DEEPSEEK_MODEL, REQUEST_TIMEOUT_MS, validApiKey } from '../src/ai/deepseek'
import { learningContexts, MAX_CONTEXT_LENGTH } from '../src/ai/context'
import type { SubjectWeek } from '../src/curriculum/types'
import type { EnrichedLesson } from '../src/curriculum/enriched-types'
import { defaultData } from '../src/model'

const fakeKey = 'MOCK_DEEPSEEK_KEY_FOR_TESTS_ONLY'
const problem = { id: 'p1', title: '当前题目', origin: 'original' as const, prompt: 'CURRENT PROMPT', answer: 'SECRET ANSWER', solution: ['HIDDEN SOLUTION'], scoring: [{ points: 2, criterion: 'HIDDEN SCORING' }], sourceStory: 'SOURCE STORY', paragraphStarters: ['STARTER'] }
const lesson: SubjectWeek = { status: 'complete', title: '当前课程', goals: ['WHOLE LESSON GOAL'], prerequisites: ['PREREQUISITE'], knowledge: [{ title: '知识点一', paragraphs: ['CURRENT KNOWLEDGE'], keyPoints: ['KEY POINT'] }, { title: '知识点二', paragraphs: ['OTHER KNOWLEDGE'] }], examPoints: ['EXAM POINT'], examples: [problem, { ...problem, id: 'p2', prompt: 'OTHER PROMPT' }], exercises: [problem], retest: { tasks: ['RETEST TASK'], criteria: ['RETEST CRITERIA'], problem }, diagnosticTest: { title: '诊断', totalPoints: 20, scopeNote: '', instructions: [], questions: [problem], scoreInterpretation: [], remediationMap: [] }, sourceIds: [] }
const enriched = { title: '深化课程', sections: [{ id: 's1', title: '深化知识', paragraphs: ['ENRICHED TEXT'], keyPoints: ['ENRICHED POINT'], checkpoint: { question: 'CHECKPOINT', answer: 'CHECKPOINT ANSWER', explanation: 'CHECKPOINT SOLUTION' } }], workedExamples: [problem], practice: [problem], diagnostic: { questions: [problem] }, quiz: { questions: [problem] } } as unknown as EnrichedLesson
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('privacy-scoped learning context', () => {
  it('includes one selected knowledge block or question, never its answer or whole lesson', () => {
    const knowledge = learningContexts(lesson, 'knowledge', 5, '数学')
    expect(knowledge).toHaveLength(2)
    expect(knowledge[0]!.text).toContain('CURRENT KNOWLEDGE')
    expect(knowledge[0]!.text).not.toContain('OTHER KNOWLEDGE')
    for (const step of ['examples', 'practice', 'retest', 'diagnostic']) {
      const text = learningContexts(lesson, step, 5, '数学')[0]!.text
      for (const value of ['CURRENT PROMPT', 'SOURCE STORY', 'STARTER']) expect(text).toContain(value)
      for (const value of ['SECRET ANSWER', 'HIDDEN SOLUTION', 'HIDDEN SCORING', 'OTHER PROMPT', 'WHOLE LESSON GOAL', 'RETEST CRITERIA']) expect(text).not.toContain(value)
    }
    expect(learningContexts(lesson, 'prepare', 5, '数学')).toEqual([])
    expect(learningContexts(undefined, 'knowledge', 5, '数学')).toEqual([])
  })
  it('covers enriched current sections and individual questions without hidden answers', () => {
    const current = { ...lesson, enrichment: enriched }
    const text = learningContexts(current, 's1', 1, '数学')[0]!.text
    expect(text).toContain('ENRICHED TEXT'); expect(text).toContain('CHECKPOINT')
    expect(text).not.toContain('CHECKPOINT ANSWER'); expect(text).not.toContain('CHECKPOINT SOLUTION')
    for (const step of ['p1', 'diagnostic', 'quiz']) expect(learningContexts(current, step, 1, '数学')[0]!.text).toContain('CURRENT PROMPT')
    for (const step of ['prepare', 'review', 'unknown']) expect(learningContexts(current, step, 1, '数学')).toEqual([])
  })
  it('makes long-context truncation visible and does not expand backup schema', () => {
    const context = learningContexts({ ...lesson, knowledge: [{ title: '长文', paragraphs: ['字'.repeat(20000)] }] }, 'knowledge', 5, '数学')[0]!
    expect(context.text.length).toBeLessThanOrEqual(MAX_CONTEXT_LENGTH)
    expect(context.text).toContain('后文未附带')
    expect(JSON.stringify(defaultData())).not.toContain(AI_KEY_STORAGE)
  })
})

describe('fixed official DeepSeek client', () => {
  it('constructs exactly one independent question and optional visible context', () => {
    const body = createRequestBody('  为什么？  ', '预览资料')
    expect(body.model).toBe('deepseek-flash'); expect(body.stream).toBe(false); expect(body.thinking.type).toBe('disabled')
    expect(body.max_tokens).toBe(2048); expect(body.messages).toHaveLength(2)
    expect(body.messages[1]!.content).toBe('我的问题：\n为什么？\n\n本次明确选择的学习资料：\n预览资料')
    expect(createRequestBody('问题').messages[1]!.content).toBe('问题')
  })
  it('sends credentials only as bearer to fixed HTTPS endpoint with redirect/cookie/referrer protection', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '<img src=x onerror=alert(1)>\n普通答案' }, finish_reason: 'stop' }] }))
    vi.stubGlobal('fetch', fetcher)
    const result = await askDeepSeek(fakeKey, '解释原因', '只选的资料')
    expect(result.answer).toContain('<img'); expect(result.truncated).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe(DEEPSEEK_ENDPOINT); expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store', mode: 'cors', headers: { Authorization: `Bearer ${fakeKey}` } })
    expect(init.body).not.toContain(fakeKey); expect(JSON.parse(init.body).model).toBe(DEEPSEEK_MODEL)
  })
  it.each([[401, 'auth'], [403, 'auth'], [402, 'balance'], [429, 'rate'], [400, 'model'], [404, 'model'], [422, 'model'], [500, 'service'], [503, 'service']])('handles HTTP %s without displaying raw provider data or retrying', async (status, code) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(`SECRET ERROR ${fakeKey}`, { status: Number(status) }))
    vi.stubGlobal('fetch', fetcher)
    await expect(askDeepSeek(fakeKey, '提问', '')).rejects.toMatchObject({ code })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('redacts echoed credentials and detects truncated output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: fakeKey }, finish_reason: 'length' }] })))
    expect(await askDeepSeek(fakeKey, '提问', '')).toEqual({ answer: '[已隐藏密钥]', truncated: true })
  })
  it.each(['not json', JSON.stringify({ error: { message: fakeKey } }), JSON.stringify({ choices: [{ message: { content: [] } }] }), JSON.stringify({ choices: [{ message: { content: ' ' } }] }), 'a'.repeat(256001)])('rejects malformed/oversized responses without raw errors', async raw => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(raw)))
    await expect(askDeepSeek(fakeKey, '提问', '')).rejects.toMatchObject({ code: 'response' })
  })
  it('does not send empty, overly long, or credential-containing input', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    expect(validApiKey('has whitespace')).toBe(false); expect(validApiKey('')).toBe(false)
    for (const question of ['', 'x'.repeat(4001), fakeKey]) await expect(askDeepSeek(fakeKey, question, '')).rejects.toMatchObject({ code: 'question' })
    await expect(askDeepSeek(fakeKey, '提问', fakeKey)).rejects.toMatchObject({ code: 'question' })
    await expect(askDeepSeek(fakeKey, '提问', 'x'.repeat(12001))).rejects.toMatchObject({ code: 'context' })
    await expect(askDeepSeek('', '提问', '')).rejects.toMatchObject({ code: 'key' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('provides a network/CORS-safe error without leaking exception details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError(fakeKey)))
    await expect(askDeepSeek(fakeKey, '提问', '')).rejects.toMatchObject({ code: 'network' })
    await expect(askDeepSeek(fakeKey, '提问', '')).rejects.not.toMatchObject({ message: fakeKey })
  })
  it('distinguishes explicit cancel from a 60-second timeout, without retries', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))))
    vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController()
    const cancelled = expect(askDeepSeek(fakeKey, '提问', '', controller.signal)).rejects.toMatchObject({ code: 'cancelled' })
    controller.abort(); await cancelled
    const timeout = expect(askDeepSeek(fakeKey, '提问', '')).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS); await timeout
    await expect(askDeepSeek(fakeKey, '提问', '', controller.signal)).rejects.toMatchObject({ code: 'cancelled' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
