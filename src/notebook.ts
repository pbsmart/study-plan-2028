import { reactive } from 'vue'
import type { InjectionKey } from 'vue'
import { names } from './model'
import type { SubjectId } from './model'
export const NOTEBOOK_KEY = 'xunxu.notebook.v1'
export interface StudyNote { id: string; week: number; subject: SubjectId; step: string; title: string; text: string; needsReview: boolean }
export function parseNotes(text: string): StudyNote[] {
  if (text.length > 5 * 1024 * 1024) throw new Error('笔记文件超过 5 MB。')
  const value = JSON.parse(text)
  if (value?.version !== 1 || !Array.isArray(value.notes) || value.notes.length > 500) throw new Error('笔记文件格式无效，最多保存500条。')
  const ids = new Set<string>()
  return value.notes.map((note: StudyNote) => {
    if (!note || !Number.isInteger(note.week) || note.week < 1 || note.week > 84 || !Object.hasOwn(names, note.subject) || typeof note.step !== 'string' || note.step.length > 200 || !/^[a-z0-9-]+$/.test(note.step) || note.id !== `${note.week}/${note.subject}/${note.step}` || ids.has(note.id) || typeof note.text !== 'string' || !note.text.trim() || note.text.length > 8000 || typeof note.title !== 'string' || note.title.length > 400 || typeof note.needsReview !== 'boolean') throw new Error('笔记条目无效；原有记录已保留。')
    ids.add(note.id)
    return { id: note.id, week: note.week, subject: note.subject, step: note.step, title: note.title, text: note.text, needsReview: note.needsReview }
  })
}
export function createNotebook(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const state = reactive({ notes: [] as StudyNote[], loaded: false, loadFailed: false, error: '', notice: '' })
  function load() {
    if (state.loaded) return
    state.loaded = true
    try { const raw = storage?.getItem(NOTEBOOK_KEY); if (raw) state.notes = parseNotes(raw) }
    catch { state.loadFailed = true; state.error = '笔记读取失败，未覆盖原始存储。可先导出原始笔记，再检查文件。' }
  }
  function persist(notes: StudyNote[]) {
    try {
      if (!storage) throw new Error()
      const clean = parseNotes(JSON.stringify({ version: 1, notes }))
      storage.setItem(NOTEBOOK_KEY, JSON.stringify({ version: 1, notes: clean }))
      state.notes = clean; state.loadFailed = false; state.error = ''; state.notice = '笔记已保存在当前浏览器。'; return true
    } catch { state.error = '笔记未能保存，原有存储未替换。请复制当前文字或导出备份。'; return false }
  }
  function latest() { const raw = storage?.getItem(NOTEBOOK_KEY); return raw ? parseNotes(raw) : state.notes }
  function save(note: StudyNote) {
    if (state.loadFailed) return false
    try { return persist([note, ...latest().filter(item => item.id !== note.id)]) }
    catch { state.error = '现有笔记无法读取，未覆盖。请先导出原始笔记。'; return false }
  }
  function remove(id: string) {
    if (state.loadFailed) return false
    try { return persist(latest().filter(note => note.id !== id)) }
    catch { state.error = '现有笔记无法读取，未删除。'; return false }
  }
  function merge(raw: string) { const imported = parseNotes(raw); const previous = state.loadFailed ? state.notes : latest(); return persist([...imported, ...previous.filter(note => !imported.some(item => item.id === note.id))]) }
  function exportText() { return JSON.stringify({ version: 1, notes: state.notes }, null, 2) }
  function exportOriginal() { try { return storage?.getItem(NOTEBOOK_KEY) || '{"version":1,"notes":[]}' } catch { state.error = '无法读取原始笔记。请保留当前文字，并检查浏览器存储权限。'; return '' } }
  return { state, load, save, remove, merge, exportText, exportOriginal }
}
export type Notebook = ReturnType<typeof createNotebook>
export const notebookKey: InjectionKey<Notebook> = Symbol('study-notebook')
