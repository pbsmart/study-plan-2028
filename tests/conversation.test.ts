import { afterEach, describe, expect, it, vi } from 'vitest'
import { containsCredential, createConversationStore, MAX_ESTIMATED_INPUT_TOKENS, MAX_HISTORY_TURNS, MAX_MEMORY_CHARACTERS, MAX_MEMORY_TURNS, MAX_REQUEST_CHARACTERS, planHistory, redactCredentials, userMessageContent, type ConversationTurn } from '../src/ai/conversation'
import { askDeepSeek, createRequestBody, SYSTEM_PROMPT } from '../src/ai/deepseek'
import { defaultData } from '../src/model'

const fakeKey = 'MOCK_DEEPSEEK_KEY_FOR_TESTS_ONLY'
const turn = (id: number, text = `问题${id}`, answer = `回答${id}`): ConversationTurn => ({ id, question: text, userContent: userMessageContent(text, `资料${id}`), answer, contextLabel: `资料${id}`, stepTitle: '知识讲解', truncated: false })
afterEach(() => vi.unstubAllGlobals())

describe('deterministic conversation budget', () => {
  it('retains system/current and alternates complete historical pairs in original order', () => {
    const history = [turn(1), turn(2)]
    const result = planHistory(history, '系统', '当前问题与资料')
    expect(result.messages.map(message => message.role)).toEqual(['system', 'user', 'assistant', 'user', 'assistant', 'user'])
    expect(result.messages.map(message => message.content)).toEqual(['系统', history[0]!.userContent, '回答1', history[1]!.userContent, '回答2', '当前问题与资料'])
    expect(result.turns.map(item => item.id)).toEqual([1, 2]); expect(result.omitted).toBe(0)
  })
  it('selects at most the six newest complete pairs without mutating history', () => {
    const history = Array.from({ length: 10 }, (_, i) => turn(i + 1))
    const before = JSON.stringify(history)
    const result = planHistory(history, SYSTEM_PROMPT, '继续解释')
    expect(result.turns.map(item => item.id)).toEqual([5, 6, 7, 8, 9, 10])
    expect(result.turns).toHaveLength(MAX_HISTORY_TURNS); expect(result.omitted).toBe(4)
    expect(JSON.stringify(history)).toBe(before)
  })
  it('uses character and approximate token budgets and never splits a pair', () => {
    const result = planHistory([turn(1, 'a', 'z'.repeat(12000)), turn(2, 'b', 'z'.repeat(12000)), turn(3, 'c', 'z'.repeat(12000))], SYSTEM_PROMPT, '当前')
    expect(result.turns.map(item => item.id)).toEqual([2, 3]); expect(result.messages).toHaveLength(6)
    expect(result.characters).toBeLessThanOrEqual(MAX_REQUEST_CHARACTERS)
    expect(result.estimatedTokens).toBeLessThanOrEqual(MAX_ESTIMATED_INPUT_TOKENS)
    const chinese = planHistory([turn(1, '甲', '中'.repeat(11000)), turn(2, '乙', '文'.repeat(11000))], SYSTEM_PROMPT, '当前')
    expect(chinese.turns.map(item => item.id)).toEqual([2])
  })
  it('does not skip an oversized newest pair to silently include older unrelated ones', () => {
    const result = planHistory([turn(1), turn(2, 'x', 'z'.repeat(32000))], SYSTEM_PROMPT, '当前新问题')
    expect(result.turns).toEqual([]); expect(result.omitted).toBe(2)
    expect(result.messages).toEqual([{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: '当前新问题' }])
  })
  it('keeps current selected material intact and can explicitly exclude history', () => {
    const current = userMessageContent('当前问题', '当次资料'.repeat(3000))
    const result = planHistory([turn(1), turn(2)], SYSTEM_PROMPT, current, false)
    expect(result.turns).toEqual([]); expect(result.omitted).toBe(2); expect(result.messages.at(-1)?.content).toBe(current)
  })
})

describe('course-scoped memory with stale-result protection', () => {
  it('restores the same week/subject session while isolating both dimensions', () => {
    const store = createConversationStore(), math = store.get(5, 'math')
    store.append(math, 0, turn(1), fakeKey)
    expect(store.get(5, 'math')).toBe(math); expect(math.turns).toHaveLength(1)
    expect(store.get(6, 'math').turns).toEqual([]); expect(store.get(5, 'physics').turns).toEqual([])
    expect(createConversationStore().get(5, 'math').turns).toEqual([])
  })
  it('clears only the current course and rejects an old in-flight revision', () => {
    const store = createConversationStore(), first = store.get(5, 'math'), other = store.get(6, 'math')
    store.append(first, 0, turn(1), fakeKey); store.append(other, 0, turn(2), fakeKey)
    store.clear(first)
    expect(store.append(first, 0, turn(3), fakeKey)).toBe(false)
    expect(first.turns).toEqual([]); expect(other.turns).toHaveLength(1)
    expect(store.append(first, first.revision, turn(1), fakeKey)).toBe(true)
  })
  it('bounds retained memory by whole turns and reports evictions', () => {
    const store = createConversationStore(), session = store.get(5, 'math')
    for (let i = 0; i < 45; i++) store.append(session, 0, turn(i), fakeKey)
    expect(session.turns).toHaveLength(MAX_MEMORY_TURNS); expect(session.evicted).toBe(5)
    store.clear(session)
    for (let i = 0; i < 8; i++) store.append(session, session.revision, turn(i, 'x', 'a'.repeat(31000)), fakeKey)
    expect(session.turns.reduce((sum, item) => sum + item.userContent.length + item.answer.length, 0)).toBeLessThanOrEqual(MAX_MEMORY_CHARACTERS)
    expect(session.evicted).toBeGreaterThan(0)
  })
  it('rejects keys in user history and redacts echoed keys from answers before retaining', () => {
    const store = createConversationStore(), session = store.get(5, 'math')
    expect(store.append(session, 0, turn(1, fakeKey), fakeKey)).toBe(false)
    expect(store.append(session, 0, turn(1, '问题', `${fakeKey} sk-FAKE_TEST_ONLY_123456`), fakeKey)).toBe(true)
    expect(session.turns[0]!.answer).not.toContain(fakeKey); expect(session.turns[0]!.answer).not.toContain('sk-')
    expect(containsCredential('sk-FAKE_TEST_ONLY_123456')).toBe(true)
    expect(redactCredentials(fakeKey, fakeKey)).toBe('[已隐藏密钥]')
  })
  it('redacts newly provided keys from all existing in-memory sessions without retaining a key registry', () => {
    const store = createConversationStore(), a = store.get(5, 'math'), b = store.get(6, 'math')
    store.append(a, 0, turn(1, 'NEW_MOCK_KEY_ONLY'), fakeKey); store.append(b, 0, turn(1, 'Q', 'NEW_MOCK_KEY_ONLY'), fakeKey)
    store.redactKey('NEW_MOCK_KEY_ONLY')
    expect(JSON.stringify([a, b])).not.toContain('NEW_MOCK_KEY_ONLY')
  })
  it('does not touch browser persistence or the learning backup schema', () => {
    const storage = { setItem: vi.fn(), getItem: vi.fn() }; vi.stubGlobal('localStorage', storage)
    const before = JSON.stringify(defaultData()), store = createConversationStore()
    store.append(store.get(5, 'math'), 0, turn(1, 'PRIVATE CONVERSATION'), fakeKey)
    expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.getItem).not.toHaveBeenCalled()
    expect(JSON.stringify(defaultData())).toBe(before); expect(before).not.toContain('PRIVATE CONVERSATION')
  })
})

describe('multi-turn API payload', () => {
  it('sends the exact preview in one explicit request, including past selected materials', async () => {
    const history = [turn(1), turn(2)], current = userMessageContent('追问', '新资料')
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '新回答' }, finish_reason: 'stop' }] }))
    vi.stubGlobal('fetch', fetcher)
    await askDeepSeek(fakeKey, '追问', '新资料', undefined, history)
    const payload = JSON.parse(fetcher.mock.calls[0]![1].body)
    expect(payload.messages).toEqual(planHistory(history, SYSTEM_PROMPT, current).messages)
    expect(payload.messages).toEqual(createRequestBody('追问', '新资料', history).messages)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('refuses credentials embedded in a historical turn without sending', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(askDeepSeek(fakeKey, '问题', '', undefined, [turn(1, '旧问题', fakeKey)])).rejects.toMatchObject({ code: 'question' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each(['aborted', 'insufficient_system_resource', 'content_filter', 'tool_calls'])('does not treat provider finish reason %s as a successful answer', async reason => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: 'partial result' }, finish_reason: reason }] })))
    await expect(askDeepSeek(fakeKey, '问题', '')).rejects.toMatchObject({ code: 'response' })
  })
})
