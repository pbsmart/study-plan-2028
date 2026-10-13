import { activeSubjects, addSession, canAddSession, dateKey, emptyWeek, names, setCompleted, StudyTimer, suggestedHours, validDate, validateData as validateLegacy, weekKey, workloadHours, workloadNames } from './legacy-model'
import type { PlanData as LegacyData, Session, SubjectId, Theme, ThirdSubject, Week, Workload } from './legacy-model'

export { activeSubjects, addSession, canAddSession, dateKey, emptyWeek, names, setCompleted, StudyTimer, suggestedHours, validDate, weekKey, workloadHours, workloadNames }
export type { Session, SubjectId, Theme, ThirdSubject, Week, Workload }
// 保留原键以便现有部署自动找到记录，不依赖网址路径或日期。
export const STORAGE_KEY = 'xunxu.gaokao.v1'
export const MIGRATION_BACKUP_KEY = 'xunxu.gaokao.v1.pre-v2'
export const MAX_STUDY_WEEK = 84
export interface PlanData {
  version: 2
  currentWeek: number
  firstCompleted: string[]
  settings: { theme: Theme; third: ThirdSubject; thirdConfirmed: boolean; workload: Workload }
  weeks: Record<string, Week>
  legacy: { examDate: string | null; weeks: Record<string, Week> }
}
export function defaultData(): PlanData { return { version: 2, currentWeek: 1, firstCompleted: [], settings: { theme: 'system', third: 'biology', thirdConfirmed: false, workload: 'normal' }, weeks: {}, legacy: { examDate: null, weeks: {} } } }
export function migrateV1(old: LegacyData): PlanData {
  const snapshot = JSON.parse(JSON.stringify(old)) as LegacyData
  const { examDate, ...settings } = snapshot.settings
  return { version: 2, currentWeek: 1, settings, firstCompleted: snapshot.firstCompleted, weeks: {}, legacy: { examDate, weeks: snapshot.weeks } }
}
function isObject(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v) }
function onlyKeys(o: Record<string, unknown>, keys: string[]): boolean { return Object.keys(o).every(k => keys.includes(k)) && keys.every(k => Object.hasOwn(o, k)) }
function validWorkload(v: unknown): v is Workload { return typeof v === 'string' && ['normal', 'busy', 'free'].includes(v) }
export function validStudyWeek(v: unknown): v is number { return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_STUDY_WEEK }
export function validateData(value: unknown): PlanData {
  if (isObject(value) && value.version === 1) return migrateV1(validateLegacy(value))
  const fail = (): never => { throw new Error('备份格式无效：支持本站 v1/v2 JSON，请检查学习序号、日志日期、科目、任务和时长。') }
  if (!isObject(value) || !onlyKeys(value, ['version', 'currentWeek', 'firstCompleted', 'settings', 'weeks', 'legacy']) || value.version !== 2 || !validStudyWeek(value.currentWeek) || !isObject(value.settings) || !isObject(value.weeks) || !isObject(value.legacy)) return fail()
  const s = value.settings, legacy = value.legacy
  if (!onlyKeys(s, ['theme', 'third', 'thirdConfirmed', 'workload']) || typeof s.theme !== 'string' || !['light', 'dark', 'system'].includes(s.theme) || typeof s.third !== 'string' || !['biology', 'geography', 'politics'].includes(s.third) || typeof s.thirdConfirmed !== 'boolean' || !validWorkload(s.workload) || !onlyKeys(legacy, ['examDate', 'weeks']) || (legacy.examDate !== null && !validDate(legacy.examDate)) || !isObject(legacy.weeks)) return fail()
  // 原始日历日志沿用 v1 严格校验；不把它们猜测映射到某个学习序号。
  const validatedLegacy = validateLegacy({ version: 1, firstCompleted: value.firstCompleted, settings: { ...s, examDate: legacy.examDate || '2028-06-07' }, weeks: legacy.weeks })
  if (Object.keys(value.weeks).length > MAX_STUDY_WEEK) return fail()
  const ids = new Set<string>(), dailyTotals: Record<string, number> = {}
  const collect = (session: Session): void => {
    if (ids.has(session.id)) return fail()
    ids.add(session.id)
    dailyTotals[session.date] = (dailyTotals[session.date] || 0) + session.seconds
    if (dailyTotals[session.date]! > 86400) return fail()
  }
  Object.values(validatedLegacy.weeks).forEach(w => w.sessions.forEach(collect))
  for (const [key, w] of Object.entries(value.weeks)) {
    if (!/^[1-9]\d{0,3}$/.test(key) || !validStudyWeek(Number(key)) || !isObject(w) || !onlyKeys(w, ['workload', 'completed', 'sessions']) || !validWorkload(w.workload) || !Array.isArray(w.completed) || !Array.isArray(w.sessions) || w.completed.length > 128 || w.sessions.length > 500 || new Set(w.completed).size !== w.completed.length) return fail()
    if (!w.completed.every(id => typeof id === 'string' && new RegExp(`^w${key}-(chinese|math|english|physics|chemistry|biology|geography|politics)-(knowledge|example|practice|retest)$`).test(id))) return fail()
    for (const session of w.sessions) {
      if (!isObject(session) || !onlyKeys(session, ['id', 'date', 'subject', 'seconds', 'source']) || typeof session.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(session.id) || !validDate(session.date) || typeof session.subject !== 'string' || !['chinese', 'math', 'english', 'physics', 'chemistry', 'biology', 'geography', 'politics'].includes(session.subject) || typeof session.seconds !== 'number' || !Number.isInteger(session.seconds) || session.seconds < 1 || session.seconds > 86400 || typeof session.source !== 'string' || !['manual', 'timer'].includes(session.source)) return fail()
      collect(session as unknown as Session)
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
export function loadData(storage: Pick<Storage, 'getItem' | 'setItem'>): { data: PlanData; error: string; migrated: boolean } {
  let data = defaultData()
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return { data, error: '', migrated: false }
    data = parseBackup(raw)
    const migrated = (JSON.parse(raw) as { version: number }).version === 1
    if (migrated) {
      try {
        if (storage.getItem(MIGRATION_BACKUP_KEY) === null) storage.setItem(MIGRATION_BACKUP_KEY, raw)
        storage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch { return { data, error: '记录已在页面中兼容迁移，但浏览器拒绝写入。原日志仍保留，请先导出 v2 备份再关闭页面。', migrated: true } }
    }
    return { data, error: '', migrated }
  } catch { return { data, error: '无法读取本地记录，原始存储未覆盖。请导出原始数据或检查浏览器存储权限。', migrated: false } }
}
export function allSessions(data: PlanData): Session[] { return [...Object.values(data.weeks), ...Object.values(data.legacy.weeks)].flatMap(w => w.sessions) }
export function canAddStudySession(data: PlanData, week: Week, date: string, seconds: number): boolean { return canAddSession(week, date, seconds) && allSessions(data).filter(s => s.date === date).reduce((sum, s) => sum + s.seconds, 0) + seconds <= 86400 }
