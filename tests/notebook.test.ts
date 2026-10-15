import { describe, expect, it } from 'vitest'
import { createNotebook, NOTEBOOK_KEY, parseNotes } from '../src/notebook'
const note = { id: '1/physics/w1-physics-pr3', week: 1, subject: 'physics' as const, step: 'w1-physics-pr3', title: '回到起点', text: '往返的每一段都计入路程。', needsReview: true }
describe('independent notebook persistence', () => {
  it('keeps plan, podcast and AI storage untouched and round-trips note metadata', () => {
    const data = new Map<string, string>([['xunxu.gaokao.v1', 'original-plan'], ['deepseek-key', 'private-placeholder']])
    const store = createNotebook({ getItem: key => data.get(key) || null, setItem: (key, value) => { expect(key).toBe(NOTEBOOK_KEY); data.set(key, value) } })
    store.load(); expect(store.save(note)).toBe(true)
    expect(parseNotes(store.exportText())).toEqual([note])
    expect(data.get('xunxu.gaokao.v1')).toBe('original-plan'); expect(data.get('deepseek-key')).toBe('private-placeholder')
    const restored = createNotebook({ getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) })
    restored.load(); expect(restored.state.notes).toEqual([note])
    restored.save({ ...note, needsReview: false }); expect(restored.state.notes[0]!.needsReview).toBe(false)
    restored.remove(note.id); expect(restored.state.notes).toEqual([])
  })
  it('merges only valid notes and preserves unrelated records', () => {
    let value = ''
    const store = createNotebook({ getItem: () => value || null, setItem: (_, next) => { value = next } })
    store.load(); store.save(note)
    const other = { ...note, id: '2/math/knowledge', week: 2, subject: 'math', step: 'knowledge' }
    store.merge(JSON.stringify({ version: 1, notes: [other] }))
    expect(store.state.notes).toHaveLength(2)
    const before = value
    expect(() => store.merge('{"version":1,"notes":[{}]}')).toThrow()
    expect(value).toBe(before)
    const second = createNotebook({ getItem: () => value, setItem: (_, next) => { value = next } }); second.load()
    store.save({ ...note, id: '3/physics/knowledge', week: 3, step: 'knowledge' })
    second.save({ ...note, text: '来自另一标签页的订正' })
    expect(parseNotes(value)).toHaveLength(3)
    for (const bad of [{ ...note, week: 0 }, { ...note, subject: 'constructor' }, { ...note, step: undefined, id: '1/physics/undefined' }, { ...note, text: 'x'.repeat(8001) }, { ...note, needsReview: 'yes' }]) expect(() => parseNotes(JSON.stringify({ version: 1, notes: [bad] }))).toThrow()
    expect(() => parseNotes(JSON.stringify({ version: 1, notes: [note, note] }))).toThrow()
  })
  it('never overwrites corrupted data, and failed writes leave the saved version intact', () => {
    let value = '{broken', deny = false
    const store = createNotebook({ getItem: () => value, setItem: (_, next) => { if (deny) throw new Error('quota'); value = next } })
    store.load(); expect(store.save(note)).toBe(false); expect(value).toBe('{broken')
    expect(store.exportOriginal()).toBe('{broken')
    store.merge(JSON.stringify({ version: 1, notes: [note] })); const before = value
    deny = true; expect(store.save({ ...note, text: 'changed' })).toBe(false); expect(value).toBe(before)
    deny = false; expect(store.save({ ...note, text: 'retry' })).toBe(true)
  })
})
