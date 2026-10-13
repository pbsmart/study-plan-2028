<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { activeSubjects, addSession, canAddSession, dateKey, emptyWeek, loadData, names, parseBackup, parseDate, setCompleted, shiftDate, STORAGE_KEY, StudyTimer, suggestedHours, validDate, weekKey, workloadHours, workloadNames } from './model'
import type { PlanData, SubjectId, Theme, Workload } from './model'
import { firstWeeks, months, pages, paths, monthlyThird, subjectGuidance } from './content'
import type { PageId } from './content'

let initial: ReturnType<typeof loadData>
try { initial = loadData(localStorage) } catch { initial = { data: { version: 1, firstCompleted: [], settings: { theme: 'system', third: 'biology', thirdConfirmed: false, examDate: '2028-06-07', workload: 'normal' }, weeks: {} }, error: '浏览器未允许本地存储；请定期导出备份。' } }
const data = ref(initial.data)
const warning = ref(initial.error)
const notice = ref('')
const page = ref<PageId>('overview')
const today = ref(dateKey())
const currentWeek = computed(() => weekKey(today.value))
const selectedWeek = ref(currentWeek.value)
const displayWeek = computed(() => page.value === 'overview' ? currentWeek.value : selectedWeek.value)
const week = computed(() => data.value.weeks[displayWeek.value] || emptyWeek(data.value.settings.workload))
const subjects = computed(() => activeSubjects(data.value.settings.third))
const title = computed(() => pages.find(n => n.id === page.value)!)
const totalSeconds = computed(() => week.value.sessions.reduce((n, s) => n + s.seconds, 0))
const checkedCount = computed(() => subjects.value.reduce((n, s) => n + ['core', 'review'].filter(t => week.value.completed.includes(`${s}-${t}`)).length, 0))
const plannedHours = computed(() => workloadHours[week.value.workload])
const percent = computed(() => Math.round(checkedCount.value / 12 * 100))
const countdown = computed(() => Math.max(0, Math.ceil((parseDate(data.value.settings.examDate).getTime() - parseDate(today.value).getTime()) / 86400000)))
const monthFilter = ref('all')
const selectedSubject = ref<SubjectId>('math')
const logDate = ref(today.value)
const minutes = ref('')
const timer = new StudyTimer()
const timerRunning = ref(false)
const timerSeconds = ref(0)
const timerSubject = ref<SubjectId>('math')
const timerDate = ref(today.value)
const timerOpen = computed(() => timerRunning.value || timerSeconds.value > 0)
const pendingImport = ref<PlanData | null>(null)
const importDialog = ref<HTMLDialogElement | null>(null)
let importTrigger: HTMLElement | null = null
const fileInput = ref<HTMLInputElement | null>(null)
const dateDraft = ref(data.value.settings.examDate)
const systemDark = ref(false)
const resolvedTheme = computed(() => data.value.settings.theme === 'system' ? (systemDark.value ? 'dark' : 'light') : data.value.settings.theme)
const stages = ['基础修补', '高中知识第一遍', '一轮与报名核验', '专题训练', '模考与考前']
const currentMonth = computed(() => months.find(m => m.key === today.value.slice(0, 7)))
const fmtHours = (seconds: number) => (seconds / 3600).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const clock = computed(() => `${String(Math.floor(timerSeconds.value / 3600)).padStart(2, '0')}:${String(Math.floor(timerSeconds.value / 60) % 60).padStart(2, '0')}:${String(timerSeconds.value % 60).padStart(2, '0')}`)
const thirdName = computed(() => data.value.settings.thirdConfirmed ? names[data.value.settings.third] : '第三科 · 待确认')
const label = (s: SubjectId) => s === data.value.settings.third ? thirdName.value : names[s]
const selectedTitle = computed(() => `${selectedWeek.value} — ${shiftDate(selectedWeek.value, 6)}`)
const actualBySubject = (s: SubjectId) => week.value.sessions.filter(n => n.subject === s).reduce((n, v) => n + v.seconds, 0)
function mutableWeek() { return data.value.weeks[selectedWeek.value] ||= emptyWeek(data.value.settings.workload) }
function choosePage(id: PageId) { page.value = id; location.hash = id; notice.value = ''; window.scrollTo({ top: 0, behavior: 'instant' }) }
function readHash() { const found = pages.find(n => n.id === location.hash.slice(1)); page.value = found?.id || 'overview' }
function changeWeek(offset: number) {
  if (timerOpen.value) return
  selectedWeek.value = shiftDate(selectedWeek.value, offset)
  logDate.value = selectedWeek.value === currentWeek.value ? today.value : selectedWeek.value
  notice.value = ''
}
function selectWorkload(event: Event) { mutableWeek().workload = (event.target as HTMLSelectElement).value as Workload }
function toggleTask(id: string, event: Event) { setCompleted(mutableWeek(), id, (event.target as HTMLInputElement).checked) }
function toggleFirst(id: string, event: Event) { data.value.firstCompleted = (event.target as HTMLInputElement).checked ? [...new Set([...data.value.firstCompleted, id])] : data.value.firstCompleted.filter(n => n !== id) }
function manualLog() {
  const amount = Number(minutes.value)
  if (!/^\d+$/.test(minutes.value) || !Number.isInteger(amount) || amount < 1 || amount > 1440) { notice.value = '请输入 1—1440 的整数分钟。'; return }
  if (!validDate(logDate.value) || weekKey(logDate.value) !== selectedWeek.value || logDate.value > today.value) { notice.value = '记录日期须在所选周内，且不能晚于今天。'; return }
  if (!canAddSession(week.value, logDate.value, amount * 60)) { notice.value = '同一天累计时长不能超过 24 小时，单周最多保存 500 条记录。'; return }
  addSession(mutableWeek(), { id: crypto.randomUUID(), date: logDate.value, subject: selectedSubject.value, seconds: amount * 60, source: 'manual' })
  minutes.value = ''
  notice.value = '已记录实际学习时间。任务完成情况需单独勾选。'
}
function startTimer() {
  if (!timerOpen.value) { timerDate.value = dateKey(); timerSubject.value = selectedSubject.value }
  if (weekKey(timerDate.value) !== selectedWeek.value || timerDate.value !== dateKey()) { notice.value = '计时仅用于今天，请先保存已有计时并返回本周。'; return }
  timer.start(); timerRunning.value = timer.running
}
function pauseTimer() { timer.pause(); timerRunning.value = false; timerSeconds.value = timer.seconds() }
function discardTimer() { timer.reset(); timerRunning.value = false; timerSeconds.value = 0; notice.value = '计时已舍弃，没有增加学习时长。' }
function saveTimer() {
  pauseTimer()
  const seconds = timer.seconds()
  if (seconds < 1) { notice.value = '计时不足 1 秒，未增加学习时长。'; return }
  const key = weekKey(timerDate.value)
  const target = data.value.weeks[key] || emptyWeek(data.value.settings.workload)
  if (!canAddSession(target, timerDate.value, seconds)) { notice.value = '计时超出一天 24 小时或单周记录上限，请舍弃计时并手动补录实际学习时间。'; return }
  data.value.weeks[key] = target
  addSession(target, { id: crypto.randomUUID(), date: timerDate.value, subject: timerSubject.value, seconds, source: 'timer' })
  timer.reset(); timerSeconds.value = 0
  notice.value = '已确认并保存本次实际学习时间。'
}
function removeSession(id: string) { if (confirm('删除这条学习记录？此操作只影响本机数据。')) { mutableWeek().sessions = week.value.sessions.filter(s => s.id !== id); notice.value = '记录已删除。' } }
function download(text: string, filename: string) { const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
function exportData() { download(JSON.stringify(data.value, null, 2), `xunxu-backup-${today.value}.json`); notice.value = '备份已导出。备份可能含你的个人学习记录，请自行保管。' }
function exportRaw() { try { download(localStorage.getItem(STORAGE_KEY) || '{}', 'xunxu-original-storage.json') } catch { notice.value = '浏览器拒绝读取存储，无法导出原始数据。' } }
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  pendingImport.value = null
  try { if (file.size > 5 * 1024 * 1024) throw new Error('备份超过 5 MB，无法导入。'); pendingImport.value = parseBackup(await file.text()); notice.value = '' }
  catch (error) { notice.value = (error as Error).message }
  finally { input.value = '' }
}
function applyImport() { if (!pendingImport.value) return; discardTimer(); data.value = pendingImport.value; dateDraft.value = data.value.settings.examDate; pendingImport.value = null; warning.value = ''; notice.value = '已覆盖本机数据。备份中的真实记录已恢复。' }
function trapImportFocus(event: KeyboardEvent) {
  const buttons = importDialog.value?.querySelectorAll<HTMLButtonElement>('button')
  if (!buttons?.length) return
  const first = buttons[0]!, last = buttons[buttons.length - 1]!
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
function setTheme(theme: Theme) { data.value.settings.theme = theme }
function saveDate() { if (!validDate(dateDraft.value)) { notice.value = '请输入有效日期。'; return }; data.value.settings.examDate = dateDraft.value; notice.value = '预计日期已更新，考试日期仍以官方公布为准。' }
function onVisibility() { if (document.hidden && timerRunning.value) { pauseTimer(); notice.value = '页面进入后台，计时已暂停。请回到页面后按实际学习情况继续。' } }
function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return
  if (event.newValue === null) { warning.value = '其他标签页已清除存储；请刷新或导出本页数据。'; return }
  try { const fresh = parseBackup(event.newValue); discardTimer(); data.value = fresh; dateDraft.value = fresh.settings.examDate; notice.value = '已同步其他标签页的最新记录；未保存的计时已舍弃。' } catch { warning.value = '其他标签页写入了无效数据，本页保留原记录。' }
}
function beforeUnload(event: BeforeUnloadEvent) { if (timerOpen.value) { event.preventDefault(); event.returnValue = '' } }
watch(data, () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data.value)); warning.value = '' } catch { warning.value = '保存失败：浏览器存储不可用或空间不足。请导出备份，关闭页面前确认记录已保存。' } }, { deep: true })
watch(resolvedTheme, theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141414' : '#f7f7f5') }, { immediate: true })
watch(subjects, () => { if (!subjects.value.includes(selectedSubject.value)) selectedSubject.value = 'math' })
watch(pendingImport, async (value) => {
  if (value) {
    importTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    importDialog.value?.showModal()
    importDialog.value?.querySelector<HTMLButtonElement>('button')?.focus()
  } else {
    await nextTick()
    importTrigger?.focus()
  }
})
let interval: ReturnType<typeof setInterval>
let media: MediaQueryList
const onMedia = (event: MediaQueryListEvent) => { systemDark.value = event.matches }
onMounted(() => {
  readHash(); media = matchMedia('(prefers-color-scheme: dark)'); systemDark.value = media.matches; media.addEventListener('change', onMedia)
  interval = setInterval(() => { today.value = dateKey(); timerSeconds.value = timer.seconds(); if (timerRunning.value && (timerDate.value !== today.value || timerSeconds.value >= 86400)) pauseTimer() }, 250)
  window.addEventListener('hashchange', readHash); window.addEventListener('storage', onStorage); window.addEventListener('beforeunload', beforeUnload); document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => { clearInterval(interval); media?.removeEventListener('change', onMedia); window.removeEventListener('hashchange', readHash); window.removeEventListener('storage', onStorage); window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('visibilitychange', onVisibility) })
</script>

<template>
  <a class="skip-link" href="#main">跳至主要内容</a>
  <div class="layout">
    <aside class="sidebar">
      <a class="brand" href="#overview" @click.prevent="choosePage('overview')"><span class="brand-icon" aria-hidden="true">循</span><span>循序<span class="brand-sub">学习是一段长路</span></span></a>
      <p class="nav-caption">我的学习计划</p>
      <nav aria-label="主导航"><a v-for="item in pages" :key="item.id" :href="`#${item.id}`" :class="{ active: page === item.id }" :aria-current="page === item.id ? 'page' : undefined" @click.prevent="choosePage(item.id)"><span class="nav-number">{{ item.mark }}</span>{{ item.label }}<span class="nav-arrow" aria-hidden="true">↗</span></a></nav>
      <div class="sidebar-bottom"><p class="small-label">目标 · 2028 高考</p><p>不必一次走很远，<br>只要今天再走一步。</p><div class="theme-group" aria-label="主题"><button :aria-pressed="data.settings.theme === 'light'" @click="setTheme('light')">浅色</button><button :aria-pressed="data.settings.theme === 'dark'" @click="setTheme('dark')">深色</button><button :aria-pressed="data.settings.theme === 'system'" @click="setTheme('system')">跟随系统</button></div><span class="local-label"><i></i>记录仅保存在此浏览器</span></div>
    </aside>
    <div class="workspace">
      <header class="topbar"><span>2028 高考弹性学习计划</span><span class="topbar-meta">通用建议 <span aria-hidden="true">/</span> {{ today }}</span></header>
      <main id="main" tabindex="-1">
        <div class="page-heading"><div><p class="eyebrow">{{ title.mark }} / STUDY PLAN</p><h1>{{ title.label }}</h1><p class="subtitle">{{ title.subtitle }}</p></div><span class="outline-badge">{{ workloadNames[week.workload] }} · {{ plannedHours }} 小时建议</span></div>
        <div v-if="warning" class="message" role="alert">{{ warning }}<button @click="exportRaw">导出原始存储</button></div>
        <div v-if="notice" class="message" role="status">{{ notice }}<button aria-label="关闭提示" @click="notice = ''">×</button></div>

        <template v-if="page === 'overview'">
          <section class="hero"><div class="hero-copy"><p class="eyebrow">让计划适应生活</p><h2>一步一步，<br>把基础学扎实。</h2><p>给工作留出空间，也给学习一个位置。<br>从可完成的小任务开始，用真实记录调整节奏。</p><button class="primary" @click="selectedWeek = currentWeek; logDate = today; choosePage('weekly')">开始本周学习 <span aria-hidden="true">→</span></button></div><div class="countdown"><span class="small-label">距预计考试日</span><strong>{{ countdown }}<small>天</small></strong><p>{{ data.settings.examDate }}<br><span>预计日期 · 待官方公布</span></p><div class="countdown-line"></div><span class="small-label">目标是一条路，不是一条保证线。</span></div></section>
          <div class="stats-grid"><article class="stat"><span class="small-label">本周实际学习</span><strong>{{ fmtHours(totalSeconds) }}<small> / {{ plannedHours }} 小时</small></strong><p>复习与测试包含在总时长内</p></article><article class="stat"><span class="small-label">本周任务完成</span><strong>{{ checkedCount }}<small> / 12 项</small></strong><p>勾选任务不会自动增加时长</p></article><article class="stat"><span class="small-label">当前阶段</span><strong class="stage-name">{{ currentMonth?.stage || '按实际进度调整' }}</strong><p>{{ currentMonth?.label || '分月路线可随时回看' }}</p></article></div>
          <div class="section-title"><h2>本周，把时间分给六科</h2><a href="#weekly" @click.prevent="choosePage('weekly')">查看每周任务 ↗</a></div>
          <div class="subject-budget"><article v-for="(s, i) in subjects" :key="s"><span class="small-label">{{ label(s) }}</span><strong>{{ suggestedHours(week.workload)[i] }}<small> 小时</small></strong><div class="progress" :aria-label="`${label(s)}已记录${fmtHours(actualBySubject(s))}小时`"><span :style="{ width: `${Math.min(100, actualBySubject(s) / (suggestedHours(week.workload)[i]! * 3600) * 100)}%` }"></span></div><p>实际 {{ fmtHours(actualBySubject(s)) }} 小时</p></article></div>
          <section class="note"><span class="note-symbol" aria-hidden="true">↳</span><div><h3>先找到可持续的节奏</h3><p>按班表拼接 20、40、90 分钟任务块。忙碌周仅作应急；连续两周无法完成常态方案时，按实际时间调整。月末预留约四分之一配额复测，不额外加码。</p></div></section>
          <div class="overview-bottom"><article class="panel"><p class="eyebrow">下一个小起点</p><h3>前四周，先摸底再修补</h3><p>自行选题、记录净时长、回访错题。诊断练习不会转换为预测高考分。</p><button class="text-button" @click="choosePage('first')">打开首四周任务 →</button></article><article class="panel"><p class="eyebrow">选科保持开放</p><h3>{{ thirdName }}</h3><p>语数英物化 + 待确认第三科。生物仅是可更改占位，允许地理或思想政治；选科需核对当地政策与专业要求。</p><button class="text-button" @click="choosePage('settings')">调整计划设置 →</button></article></div>
        </template>

        <template v-else-if="page === 'roadmap'">
          <section class="note"><span class="note-symbol" aria-hidden="true">21</span><div><h3>2026 年 10 月 — 2028 年 6 月</h3><p>每月约四分之一配额用于复测与订正，已包含在总时长中。未完成可顺延；报名、体检与考试时间以当地官方通知为准。</p></div></section>
          <div class="filter-row" aria-label="路线阶段筛选"><button :aria-pressed="monthFilter === 'all'" @click="monthFilter = 'all'">全部月份</button><button v-for="stage in stages" :key="stage" :aria-pressed="monthFilter === stage" @click="monthFilter = stage">{{ stage }}</button></div>
          <div class="timeline"><article v-for="(m, i) in months.filter(m => monthFilter === 'all' || m.stage === monthFilter)" :key="m.key" class="month" :class="{ 'current-month': m.key === today.slice(0,7) }"><div class="month-index"><span>{{ m.label }}</span><small>{{ m.stage }}</small><span v-if="m.key === today.slice(0,7)" class="outline-badge">本月</span></div><div><h2>{{ m.title }}</h2><p>{{ m.detail }}</p><p class="third-detail">{{ thirdName }}{{ !data.settings.thirdConfirmed ? '（生物参考）' : '' }}：{{ monthlyThird(data.settings.third, months.indexOf(m)) }}</p><span class="small-label">{{ String(i + 1).padStart(2,'0') }} / 按实际掌握程度推进</span></div></article></div>
        </template>

        <template v-else-if="page === 'subjects'">
          <section class="note"><span class="note-symbol" aria-hidden="true">↳</span><div><h3>学一点，练一点，隔几天再看一点</h3><p>以下为教材学习与自行选题指引，不提供真实题库或智能评分。以当地课程、选科要求和当前教材为准。</p></div></section>
          <div class="paths-grid"><article v-for="(s, index) in subjects" :key="s" class="panel subject-path"><div class="path-heading"><h2>{{ label(s) }}</h2><span class="outline-badge">{{ suggestedHours(week.workload)[index] }} 小时 / 周建议</span></div><p>{{ paths[s].goal }}</p><ol><li v-for="(step, i) in paths[s].steps" :key="step"><span>{{ String(i+1).padStart(2,'0') }}</span>{{ step }}</li></ol><div class="path-foot">{{ subjectGuidance[s].allocation }}<br>{{ subjectGuidance[s].shortTask }}<br>回看：{{ paths[s].review }}</div></article></div>
          <section class="note" style="margin-top:22px"><span class="note-symbol" aria-hidden="true">↳</span><div><h3>学习与检查的建议</h3><p>每科先确认版本，再选一套教材、一条对齐课程、一本基础练习，不必一次买齐。20 分钟只做一件小事；40 分钟可分回忆 5、新知 10、练习 20、错因 5；90 分钟分两块 40 与复盘 10，休息另计，不熬夜或开车时学习。</p><p>已学基础题正确率低于 60% 先补前置；60%—80% 基础与变式并行；至少间隔两天的同类新题两次达到约 80%，再增加中档题。这只是自行检查建议，不是智能评分、录取预测或精确等级赋分。</p></div></section>
        </template>

        <template v-else-if="page === 'first'">
          <section class="note"><span class="note-symbol" aria-hidden="true">04</span><div><h3>先稳定四周，再做长期调整</h3><p>勾选表示你已实际完成。这里是自行选题与练习指引，没有内置试卷或评分；时长需到「每周任务」单独记录。首四周打卡单独保存，不计入每周 12 项。</p></div></section>
          <div class="first-grid"><article v-for="(w, index) in firstWeeks" :key="w.title" class="panel"><p class="eyebrow">WEEK {{ String(index+1).padStart(2,'0') }}</p><h2>{{ w.title }}</h2><p>{{ w.summary }}</p><label v-for="(task, i) in w.tasks" :key="task" class="check-row"><input type="checkbox" :checked="data.firstCompleted.includes(`first-${index+1}-${i}`)" @change="toggleFirst(`first-${index+1}-${i}`, $event)"/><span>{{ task }}</span></label><div class="small-label">{{ w.tasks.filter((_, i) => data.firstCompleted.includes(`first-${index+1}-${i}`)).length }} / {{ w.tasks.length }} 项已确认完成</div></article></div>
        </template>

        <template v-else-if="page === 'weekly'">
          <div class="week-toolbar"><div class="week-switch"><button aria-label="上一周" :disabled="timerOpen" @click="changeWeek(-7)">←</button><strong>{{ selectedTitle }}</strong><button aria-label="下一周" :disabled="timerOpen || selectedWeek >= currentWeek" @click="changeWeek(7)">→</button><button :disabled="timerOpen" @click="selectedWeek = currentWeek; logDate = today">本周</button></div><label class="inline-field">建议配额<select aria-label="本周建议方案" :value="week.workload" @change="selectWorkload"><option v-for="(name, key) in workloadNames" :key="key" :value="key">{{ name }} · {{ workloadHours[key] }} 小时</option></select></label></div>
          <div class="weekly-summary"><div><span class="small-label">实际 / 建议</span><strong>{{ fmtHours(totalSeconds) }} / {{ plannedHours }} <small>小时</small></strong></div><div><span class="small-label">任务完成 {{ checkedCount }} / 12</span><div class="progress"><span :style="{ width: percent + '%' }"></span></div></div></div>
          <p class="help">建议配额可以切换；复习与测试已计入总量。忙碌方案仅作应急。勾选「我已完成」只记任务，计时和手动补录只记实际时长。</p>
          <div class="weekly-grid"><section class="panel"><div class="section-title"><h2>本周任务清单</h2><span class="small-label">20 / 40 / 90 分钟任务块</span></div><div v-for="(s, i) in subjects" :key="s" class="task-subject"><div class="task-subject-title"><h3>{{ label(s) }}</h3><span>{{ suggestedHours(week.workload)[i] }} 小时建议</span></div><label v-for="kind in (['core', 'review'] as const)" :key="kind" class="check-row"><input type="checkbox" :checked="week.completed.includes(`${s}-${kind}`)" @change="toggleTask(`${s}-${kind}`, $event)"/><span><small>我已完成 · {{ kind === 'core' ? '学习与练习' : '复习与订正' }}</small>{{ paths[s][kind] }}</span></label></div></section><div class="record-column"><section class="panel"><p class="eyebrow">FOCUS</p><h2>记录实际学习</h2><label class="field">学习科目<select v-model="selectedSubject" :disabled="timerOpen"><option v-for="s in subjects" :key="s" :value="s">{{ label(s) }}{{ s === data.settings.third && !data.settings.thirdConfirmed ? '（生物参考）' : '' }}</option></select></label><div class="timer"><span class="small-label">{{ timerOpen ? `${names[timerSubject]} · ${timerDate}` : '从你开始学习时计时' }}</span><strong aria-live="off">{{ clock }}</strong><div class="button-row"><button v-if="!timerRunning" :disabled="selectedWeek !== currentWeek" class="primary" @click="startTimer">{{ timerSeconds > 0 ? '继续计时' : '开始计时' }}</button><button v-else class="primary" @click="pauseTimer">暂停计时</button><button :disabled="timerSeconds < 1" @click="saveTimer">确认学习并保存</button></div><button v-if="timerOpen" class="text-button" @click="discardTimer">舍弃本次计时</button><p class="help">切到后台自动暂停。计时不自动保存；仅确认实际学习后才计入记录。刷新会丢弃未保存计时。</p></div><form class="manual-form" @submit.prevent="manualLog"><h3>手动补录</h3><label class="field">学习日期<input v-model="logDate" type="date" :min="selectedWeek" :max="shiftDate(selectedWeek,6) < today ? shiftDate(selectedWeek,6) : today" required/></label><label class="field">实际分钟数<input v-model="minutes" type="number" inputmode="numeric" min="1" max="1440" step="1" placeholder="例如 40" required/></label><button class="full-width" type="submit">确认并添加实际时长</button></form></section></div></div>
          <section class="panel session-panel"><div class="section-title"><h2>本周学习记录</h2><span class="small-label">{{ week.sessions.length }} 条 · 含已切换科目的历史记录</span></div><div v-if="!week.sessions.length" class="empty-state"><span aria-hidden="true">—</span><h3>还没有学习记录</h3><p>完成一次学习后，确认保存计时或手动补录。<br>计划从零开始，记录也从零开始。</p></div><ul v-else class="session-list"><li v-for="s in [...week.sessions].reverse()" :key="s.id"><span>{{ s.date }}<small>{{ s.source === 'manual' ? '手动补录' : '确认计时' }}</small></span><strong>{{ names[s.subject] }}</strong><span>{{ Math.floor(s.seconds / 60) }} 分 {{ s.seconds % 60 }} 秒</span><button :aria-label="`删除${s.date}${names[s.subject]}学习记录`" @click="removeSession(s.id)">删除</button></li></ul></section>
        </template>

        <template v-else-if="page === 'settings'">
          <div class="settings-grid"><section class="panel"><p class="eyebrow">PLAN</p><h2>计划设置</h2><label class="field">第三科参考<select v-model="data.settings.third" :disabled="timerOpen"><option value="biology">生物（初始占位）</option><option value="geography">地理</option><option value="politics">思想政治</option></select></label><label class="check-row"><input v-model="data.settings.thirdConfirmed" type="checkbox"/><span>我已核对官方选科与专业要求，暂定这门第三科</span></label><p class="help">未确认时显示「待确认」。不能根据原有科类直接认定生物，也不认为某科天然容易赋分。切换后路径与任务随之更新，历史学习记录保留。</p><label class="field">新周默认建议<select v-model="data.settings.workload"><option v-for="(name, key) in workloadNames" :key="key" :value="key">{{ name }} · {{ workloadHours[key] }} 小时</option></select></label><p class="help">已有周使用各自保存的方案。连续两周无法完成常态配额时，按实际可用时间调整。</p><form @submit.prevent="saveDate"><label class="field">预计考试日期<input v-model="dateDraft" type="date" min="2000-01-01" max="2099-12-31" required/></label><button type="submit">保存预计日期</button></form><p class="help">默认 2028-06-07 仅用于规划倒计时，日期与时段待官方公布。</p></section><div><section class="panel"><p class="eyebrow">APPEARANCE</p><h2>显示主题</h2><div class="theme-options"><button v-for="(name, key) in { light: '浅色', dark: '深色', system: '跟随系统' }" :key="key" :aria-pressed="data.settings.theme === key" @click="setTheme(key)"><span class="theme-preview" :class="key" aria-hidden="true"></span>{{ name }}</button></div></section><section class="panel backup-panel"><p class="eyebrow">LOCAL DATA</p><h2>数据备份</h2><p>打卡、时长、主题与设置保存在此浏览器的 localStorage。更换设备、网址或清理浏览器可能导致记录不可用，请定期导出。</p><div class="button-row"><button class="primary" @click="exportData">导出 JSON 备份</button><button :disabled="timerOpen" @click="fileInput?.click()">导入 JSON 备份</button></div><input ref="fileInput" class="hidden-input" type="file" accept=".json,application/json" aria-label="选择 JSON 备份" @change="importFile"/><p class="help">导入限 5 MB，先校验后确认覆盖。备份不包含未保存的计时。导入前建议先导出当前数据。</p><p class="privacy-label">无登录 · 无服务端收集 · 无分析埋点</p></section></div></div>
          <section class="note"><span class="note-symbol" aria-hidden="true">↳</span><div><h3>学习建议的边界</h3><p>本计划提供通用安排，不保证考试成绩或录取。某年的分数或录取线不能作为未来保证线。报考、选科、教材范围与考试安排应核对当地官方发布。</p><p>历史官方资料仅供核验思路参考：<a class="source-link" href="https://zzjy.zhengzhou.gov.cn/ptgzyjs/9673247.jhtml" target="_blank" rel="noopener noreferrer">河南 2026 年报名问答 ↗</a>；<a class="source-link" href="https://gaokao.chsi.com.cn/gkxx/zc/ss/202402/20240229/2293259554.html" target="_blank" rel="noopener noreferrer">听力及计分历史资料 ↗</a>。2028 年以官方当年要求为准，网站不提供报考资格判断。</p></div></section>
        </template>

        <footer><span>循序 · 在生活里，留一块学习的地方。</span><span>通用计划 / 本地记录 / 自主调整</span></footer>
      </main>
    </div>
  </div>
  <dialog v-if="pendingImport" ref="importDialog" class="modal" aria-labelledby="import-title" @keydown.tab="trapImportFocus" @cancel.prevent="pendingImport = null"><p class="eyebrow">IMPORT BACKUP</p><h2 id="import-title">确认覆盖本机数据？</h2><p>备份校验通过：{{ Object.keys(pendingImport.weeks).length }} 周记录，{{ pendingImport.firstCompleted.length }} 项首四周打卡。当前打卡、学习时长、主题与设置将被替换。</p><p class="help">可以先取消并导出当前备份。此操作不向服务器上传数据。</p><div class="button-row"><button autofocus @click="pendingImport = null">取消，保留当前数据</button><button class="primary" @click="applyImport">确认覆盖并导入</button></div></dialog>
</template>
