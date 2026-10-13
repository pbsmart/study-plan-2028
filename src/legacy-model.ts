export const STORAGE_KEY = 'xunxu.gaokao.v1'
export const subjectIds = ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology', 'geography', 'politics'] as const
export type SubjectId = typeof subjectIds[number]
export type ThirdSubject = 'biology' | 'geography' | 'politics'
export type Workload = 'normal' | 'busy' | 'free'
export type Theme = 'light' | 'dark' | 'system'
export interface Session { id: string; date: string; subject: SubjectId; seconds: number; source: 'manual' | 'timer' }
export interface Week { workload: Workload; completed: string[]; sessions: Session[] }
export interface PlanData {
  version: 1
  firstCompleted: string[]
  settings: { theme: Theme; third: ThirdSubject; thirdConfirmed: boolean; examDate: string; workload: Workload }
  weeks: Record<string, Week>
}
export const names: Record<SubjectId, string> = { chinese: '语文', math: '数学', english: '英语', physics: '物理', chemistry: '化学', biology: '生物', geography: '地理', politics: '政治' }
export const workloadNames: Record<Workload, string> = { normal: '常态周', busy: '忙碌周', free: '加量周' }
export const workloadHours: Record<Workload, number> = { normal: 16, busy: 8, free: 22 }
export const baseHours = [2, 4, 3, 3, 2.5, 1.5]
export function activeSubjects(third: ThirdSubject): SubjectId[] { return ['chinese', 'math', 'english', 'physics', 'chemistry', third] }
export function defaultData(): PlanData { return { version: 1, firstCompleted: [], settings: { theme: 'system', third: 'biology', thirdConfirmed: false, examDate: '2028-06-07', workload: 'normal' }, weeks: {} } }
export function dateKey(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
export function parseDate(value: string): Date { const [y, m, d] = value.split('-').map(Number); return new Date(y!, m! - 1, d!, 12) }
export function validDate(value: unknown): value is string { return typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) && dateKey(parseDate(value)) === value }
export function weekKey(value = dateKey()): string { const date = parseDate(value); date.setDate(date.getDate() - (date.getDay() + 6) % 7); return dateKey(date) }
export function shiftDate(value: string, days: number): string { const date = parseDate(value); date.setDate(date.getDate() + days); return dateKey(date) }
export function suggestedHours(workload: Workload): number[] { return { normal: baseHours, busy: [1, 2, 1.5, 1.5, 1, 1], free: [3, 5, 4, 4, 3.5, 2.5] }[workload] }
export function emptyWeek(workload: Workload): Week { return { workload, completed: [], sessions: [] } }
export function setCompleted(week: Week, id: string, checked: boolean): void { week.completed = checked ? [...new Set([...week.completed, id])] : week.completed.filter(n => n !== id) }
export function addSession(week: Week, session: Session): boolean { if (week.sessions.some(n => n.id === session.id)) return false; week.sessions.push(session); return true }
function isObject(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v) }
function onlyKeys(o: Record<string, unknown>, keys: string[]): boolean { return Object.keys(o).every(k => keys.includes(k)) && keys.every(k => Object.hasOwn(o, k)) }
const validWorkload = (v: unknown): v is Workload => ['normal', 'busy', 'free'].includes(String(v))
export function validateData(value: unknown): PlanData {
  const fail = (): never => { throw new Error('备份格式无效：请使用本网站导出的 v1 JSON，检查日期、科目、任务和学习时长。') }
  if (!isObject(value) || !onlyKeys(value, ['version', 'firstCompleted', 'settings', 'weeks']) || value.version !== 1 || !Array.isArray(value.firstCompleted) || value.firstCompleted.length > 32 || new Set(value.firstCompleted).size !== value.firstCompleted.length || !value.firstCompleted.every(id => typeof id === 'string' && /^first-[1-4]-[0-7]$/.test(id)) || !isObject(value.settings) || !isObject(value.weeks)) return fail()
  const s = value.settings
  if (!onlyKeys(s, ['theme', 'third', 'thirdConfirmed', 'examDate', 'workload']) || !['light', 'dark', 'system'].includes(String(s.theme)) || !['biology', 'geography', 'politics'].includes(String(s.third)) || typeof s.thirdConfirmed !== 'boolean' || !validDate(s.examDate) || !validWorkload(s.workload)) return fail()
  if (Object.keys(value.weeks).length > 5200) return fail()
  const allIds = new Set<string>()
  for (const [key, w] of Object.entries(value.weeks)) {
    if (!validDate(key) || weekKey(key) !== key || !isObject(w) || !onlyKeys(w, ['workload', 'completed', 'sessions']) || !validWorkload(w.workload) || !Array.isArray(w.completed) || !Array.isArray(w.sessions) || w.completed.length > 16 || w.sessions.length > 500 || new Set(w.completed).size !== w.completed.length) return fail()
    if (!w.completed.every(id => typeof id === 'string' && /^(chinese|math|english|physics|chemistry|biology|geography|politics)-(core|review)$/.test(id))) return fail()
    const totals: Record<string, number> = {}
    for (const session of w.sessions) {
      if (!isObject(session) || !onlyKeys(session, ['id', 'date', 'subject', 'seconds', 'source']) || typeof session.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(session.id) || allIds.has(session.id) || !validDate(session.date) || weekKey(session.date) !== key || !subjectIds.includes(session.subject as SubjectId) || typeof session.seconds !== 'number' || !Number.isInteger(session.seconds) || session.seconds < 1 || session.seconds > 86400 || !['manual', 'timer'].includes(String(session.source))) return fail()
      totals[session.date] = (totals[session.date] || 0) + session.seconds
      if (totals[session.date]! > 86400) return fail()
      allIds.add(session.id)
    }
  }
  return JSON.parse(JSON.stringify(value)) as PlanData
}
export function parseBackup(text: string): PlanData {
  if (new TextEncoder().encode(text).length > 5 * 1024 * 1024) throw new Error('备份超过 5 MB，无法导入。')
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('文件不是有效 JSON，原数据未更改。') }
  return validateData(value)
}
export function loadData(storage: Pick<Storage, 'getItem'>): { data: PlanData; error: string } {
  try { const raw = storage.getItem(STORAGE_KEY); return { data: raw ? parseBackup(raw) : defaultData(), error: '' } }
  catch { return { data: defaultData(), error: '无法读取本地记录。原始存储尚未覆盖；请先在设置中导出原始数据，或检查浏览器存储权限。' } }
}
export function canAddSession(week: Week, date: string, seconds: number): boolean { return Number.isInteger(seconds) && seconds > 0 && seconds <= 86400 && week.sessions.filter(s => s.date === date).reduce((n, s) => n + s.seconds, 0) + seconds <= 86400 && week.sessions.length < 500 }
export class StudyTimer {
  private started: number | null = null
  private elapsed = 0
  constructor(private now: () => number = () => performance.now()) {}
  get running(): boolean { return this.started !== null }
  start(): void { if (this.started === null) this.started = this.now() }
  pause(): void { if (this.started !== null) { this.elapsed += Math.max(0, this.now() - this.started); this.started = null } }
  seconds(): number { return Math.floor((this.elapsed + (this.started === null ? 0 : Math.max(0, this.now() - this.started))) / 1000) }
  reset(): void { this.started = null; this.elapsed = 0 }
}
