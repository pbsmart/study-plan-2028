<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { activeSubjects, addSession, allSessions, canAddStudySession, dateKey, defaultData, emptyWeek, loadData, names, parseBackup, setCompleted, STORAGE_KEY, StudyTimer, validDate, workloadHours, workloadNames } from './model'
import type { PlanData, SubjectId, Theme, Workload } from './model'
import { firstWeeks, paths } from './content'
import { curriculum, curriculumCoverage, getStudyWeek, loadStudyWeek, peekStudyWeek, totalStudyWeeks } from './curriculum'
import { useStudyWeek } from './composables/useStudyWeek'
import { statusNames } from './curriculum/types'
import { sourceScope } from './curriculum/sources'
import FocusLesson from './components/FocusLesson.vue'
import { learningHash, parseLearningRoute, lessonSteps } from './focus'

const pages = [
  { id: 'overview', label: '学习概览', mark: '01', subtitle: '按自己的节奏，走完每个学习周。' },
  { id: 'roadmap', label: '学习路线', mark: '02', subtitle: '只按周编号，未学完可以停留。' },
  { id: 'subjects', label: '六科学习路径', mark: '03', subtitle: '连接知识点、考点与独立练习。' },
  { id: 'first', label: '首四周学习', mark: '04', subtitle: '先把基础理解，再复测与订正。' },
  { id: 'weekly', label: '学习周', mark: '05', subtitle: '讲解、例题、练习与真实记录。' },
  { id: 'settings', label: '设置与备份', mark: '06', subtitle: '保留记录，自主调整进度。' },
] as const
type PageId = typeof pages[number]['id']
let initial: ReturnType<typeof loadData>
try { initial = loadData(localStorage) } catch { initial = { data: defaultData(), error: '浏览器未允许本地存储，请定期导出备份。', migrated: false } }
const data = ref(initial.data)
const warning = ref(initial.error)
const notice = ref(initial.migrated ? '旧记录已兼容迁移：原日历周日志和首四周打卡均保留。学习序号从第 1 周开始，不按日期推算。' : '')
const page = ref<PageId>('overview')
const today = ref(dateKey())
const selectedWeek = ref(data.value.currentWeek)
const displayWeek = computed(() => page.value === 'overview' ? data.value.currentWeek : selectedWeek.value)
const week = computed(() => data.value.weeks[String(displayWeek.value)] || emptyWeek(data.value.settings.workload))
const course = computed(() => getStudyWeek(displayWeek.value))
const currentCourse = computed(() => getStudyWeek(data.value.currentWeek))
const subjects = computed(() => activeSubjects(data.value.settings.third))
const lessonSubject = ref<SubjectId>('math')
const selectedSubject = ref<SubjectId>('math')
const focusActive = ref(false)
const focusStep = ref('prepare')
const { course: loadedCourse, loading: courseLoading, error: courseError, retry: loadFocusedCourse } = useStudyWeek(focusActive, selectedWeek, { loadStudyWeek, peekStudyWeek })
const focusLesson = computed(() => loadedCourse.value?.week === selectedWeek.value ? loadedCourse.value.subjects[lessonSubject.value] : undefined)
watch([loadedCourse, lessonSubject, focusActive, focusStep], () => {
  if (!focusActive.value || !focusLesson.value) return
  if (!lessonSteps(focusLesson.value).some(step => step.id === focusStep.value)) {
    focusStep.value = 'prepare'
    history.replaceState(null, '', learningHash(selectedWeek.value, lessonSubject.value))
  }
})
const title = computed(() => pages.find(n => n.id === page.value)!)
const totalSeconds = computed(() => week.value.sessions.reduce((n, s) => n + s.seconds, 0))
const totalRecordedSeconds = computed(() => allSessions(data.value).reduce((n, s) => n + s.seconds, 0))
const taskKinds = ['knowledge', 'example', 'practice', 'retest'] as const
const checkedCount = computed(() => subjects.value.reduce((n, s) => n + taskKinds.filter(kind => week.value.completed.includes(`w${displayWeek.value}-${s}-${kind}`)).length, 0))
const plannedHours = computed(() => workloadHours[week.value.workload])
const thirdName = computed(() => data.value.settings.thirdConfirmed ? names[data.value.settings.third] : '第三科 · 待确认')
const label = (s: SubjectId) => s === data.value.settings.third ? thirdName.value : names[s]
const fmtHours = (seconds: number) => (seconds / 3600).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const stageFilter = ref('all')
const stages = computed(() => [...new Set(curriculum.map(w => w.stage))])
const routeSearch = ref('')
const routeWeeks = computed(() => curriculum.filter(w => (stageFilter.value === 'all' || w.stage === stageFilter.value) && (!routeSearch.value || `${w.week} ${w.title} ${Object.values(w.subjects).map(s => s?.title).join(' ')}`.includes(routeSearch.value))))
const legacyEntries = computed(() => Object.entries(data.value.legacy.weeks).sort(([a], [b]) => b.localeCompare(a)))
const logDate = ref(today.value)
const minutes = ref('')
const timer = new StudyTimer()
const timerRunning = ref(false)
const timerSeconds = ref(0)
const timerSubject = ref<SubjectId>('math')
const timerDate = ref(today.value)
const timerWeek = ref(selectedWeek.value)
const timerOpen = computed(() => timerRunning.value || timerSeconds.value > 0)
const clock = computed(() => `${String(Math.floor(timerSeconds.value / 3600)).padStart(2, '0')}:${String(Math.floor(timerSeconds.value / 60) % 60).padStart(2, '0')}:${String(timerSeconds.value % 60).padStart(2, '0')}`)
const pendingImport = ref<PlanData | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const importDialog = ref<HTMLDialogElement | null>(null)
let importTrigger: HTMLElement | null = null
const systemDark = ref(false)
const resolvedTheme = computed(() => data.value.settings.theme === 'system' ? (systemDark.value ? 'dark' : 'light') : data.value.settings.theme)

function skipToMain() { document.getElementById('main')?.focus(); document.getElementById('main')?.scrollIntoView({ block: 'start' }) }
function mutableWeek() { return data.value.weeks[String(selectedWeek.value)] ||= emptyWeek(data.value.settings.workload) }
function choosePage(id: PageId) { focusActive.value = false; page.value = id; location.hash = id; window.scrollTo({ top: 0, behavior: 'instant' }) }
function readHash() {
  const route = parseLearningRoute(location.hash, totalStudyWeeks, subjects.value)
  if (route) {
    if (timerOpen.value && route.week !== selectedWeek.value) {
      notice.value = '请先保存或舍弃当前计时再切换学习周。'
      history.replaceState(null, '', focusActive.value ? learningHash(selectedWeek.value, lessonSubject.value, focusStep.value) : '#weekly')
      return
    }
    page.value = 'weekly'; selectedWeek.value = route.week; lessonSubject.value = route.subject
    focusStep.value = route.step
    focusActive.value = true
    return
  }
  focusActive.value = false
  const found = pages.find(n => n.id === location.hash.slice(1)); page.value = found?.id || 'overview'
}
function startFocus() { page.value = 'weekly'; focusActive.value = true; focusStep.value = 'prepare'; location.hash = learningHash(selectedWeek.value, lessonSubject.value); window.scrollTo({ top: 0, behavior: 'instant' }) }
function changeFocusStep(step: string) { focusStep.value = step; location.hash = learningHash(selectedWeek.value, lessonSubject.value, step) }
async function exitFocus() { choosePage('weekly'); await nextTick(); document.querySelector<HTMLButtonElement>('.start-focus')?.focus({ preventScroll: true }) }

function openWeek(number: number, learning = false) { if (timerOpen.value) { notice.value = '请先保存或舍弃当前计时再切换学习周。'; return }; selectedWeek.value = number; if (learning) startFocus(); else choosePage('weekly') }
function browseWeek(offset: number) { if (!timerOpen.value) selectedWeek.value = Math.max(1, Math.min(totalStudyWeeks, selectedWeek.value + offset)) }
function setCurrentWeek(number: number) {
  if (timerOpen.value) return
  data.value.currentWeek = Math.max(1, Math.min(totalStudyWeeks, number))
  selectedWeek.value = data.value.currentWeek
  notice.value = `已手动切换到第 ${data.value.currentWeek} 周。没有自动勾选任务或增加学习时长，未学完可继续停留。`
}
function selectWorkload(event: Event) { mutableWeek().workload = (event.target as HTMLSelectElement).value as Workload }
function toggleTask(id: string, checked: boolean) { setCompleted(mutableWeek(), id, checked) }
function manualLog() {
  const amount = Number(minutes.value)
  if (!/^\d+$/.test(minutes.value) || amount < 1 || amount > 1440) { notice.value = '请输入 1—1440 的整数分钟。'; return }
  if (!validDate(logDate.value) || logDate.value > today.value) { notice.value = '请输入有效的日志日期，不能晚于今天。日期只记录学习发生时间，不决定学习周。'; return }
  if (!canAddStudySession(data.value, week.value, logDate.value, amount * 60)) { notice.value = '同一日志日期累计时长不能超过 24 小时，每个学习周最多保存 500 条记录。'; return }
  addSession(mutableWeek(), { id: crypto.randomUUID(), date: logDate.value, subject: selectedSubject.value, seconds: amount * 60, source: 'manual' })
  minutes.value = ''; notice.value = `已记录第 ${selectedWeek.value} 周的实际学习时间。日志日期不会改变学习序号。`
}
function startTimer() {
  if (!timerOpen.value) { timerDate.value = dateKey(); timerSubject.value = selectedSubject.value; timerWeek.value = selectedWeek.value }
  if (timerDate.value !== dateKey()) { notice.value = '请先保存或舍弃上一日志日期的计时。'; return }
  timer.start(); timerRunning.value = timer.running
}
function pauseTimer() { timer.pause(); timerRunning.value = false; timerSeconds.value = timer.seconds() }
function discardTimer() { timer.reset(); timerRunning.value = false; timerSeconds.value = 0 }
function saveTimer() {
  pauseTimer(); const seconds = timer.seconds()
  if (seconds < 1) { notice.value = '计时不足 1 秒，未增加学习时长。'; return }
  const key = String(timerWeek.value), target = data.value.weeks[key] || emptyWeek(data.value.settings.workload)
  if (!canAddStudySession(data.value, target, timerDate.value, seconds)) { notice.value = '计时超出每日或学习周记录上限，请舍弃并补录实际学习时间。'; return }
  data.value.weeks[key] = target; addSession(target, { id: crypto.randomUUID(), date: timerDate.value, subject: timerSubject.value, seconds, source: 'timer' })
  discardTimer(); notice.value = `已确认并保存第 ${timerWeek.value} 周的实际学习时间。`
}
function removeSession(id: string) { if (confirm('删除这条实际学习记录？')) mutableWeek().sessions = week.value.sessions.filter(s => s.id !== id) }
function download(text: string, filename: string) { const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
function exportData() { download(JSON.stringify(data.value, null, 2), 'xunxu-backup-v2.json'); notice.value = 'v2 备份已导出，包含学习序号和完整旧日志。请自行保管。' }
function exportRaw() { try { download(localStorage.getItem(STORAGE_KEY) || '{}', 'xunxu-original-storage.json') } catch { notice.value = '浏览器拒绝读取原始存储。' } }
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return
  pendingImport.value = null
  try { if (file.size > 5 * 1024 * 1024) throw new Error('备份超过 5 MB，无法导入。'); pendingImport.value = parseBackup(await file.text()); notice.value = '' }
  catch (error) { notice.value = (error as Error).message }
  finally { input.value = '' }
}
function applyImport() { if (!pendingImport.value) return; discardTimer(); data.value = pendingImport.value; selectedWeek.value = data.value.currentWeek; pendingImport.value = null; warning.value = ''; notice.value = '已确认覆盖并恢复备份；v1 日历日志不会被猜测分配到学习周。' }
function trapImportFocus(event: KeyboardEvent) { const buttons = importDialog.value?.querySelectorAll<HTMLButtonElement>('button'); if (!buttons?.length) return; const first = buttons[0]!, last = buttons[buttons.length - 1]!; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() } }
function setTheme(theme: Theme) { data.value.settings.theme = theme }
function onVisibility() { if (document.hidden && timerRunning.value) { pauseTimer(); notice.value = '页面进入后台，计时已暂停。' } }
function onStorage(event: StorageEvent) { if (event.key !== STORAGE_KEY) return; if (!event.newValue) { warning.value = '其他标签页清除了记录，请导出本页数据或刷新。'; return }; try { discardTimer(); data.value = parseBackup(event.newValue); selectedWeek.value = data.value.currentWeek; if (focusActive.value) { focusStep.value = 'prepare'; history.replaceState(null, '', learningHash(selectedWeek.value, lessonSubject.value)) }; notice.value = '已同步其他标签页的数据，未保存计时已舍弃。' } catch { warning.value = '其他标签页写入了无效数据，本页保留原记录。' } }
function beforeUnload(event: BeforeUnloadEvent) { if (timerOpen.value) { event.preventDefault(); event.returnValue = '' } }
watch(data, () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data.value)); warning.value = '' } catch { warning.value = '保存失败，请导出备份再关闭页面。' } }, { deep: true })
watch(resolvedTheme, theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141414' : '#f7f7f5') }, { immediate: true })
watch(subjects, () => { if (!subjects.value.includes(selectedSubject.value)) selectedSubject.value = 'math'; if (!subjects.value.includes(lessonSubject.value)) { lessonSubject.value = data.value.settings.third; focusStep.value = 'prepare'; if (focusActive.value) history.replaceState(null, '', learningHash(selectedWeek.value, lessonSubject.value)) } })
watch(pendingImport, async value => { if (value) { importTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null; await nextTick(); importDialog.value?.showModal(); importDialog.value?.querySelector<HTMLButtonElement>('button')?.focus() } else { await nextTick(); importTrigger?.focus() } })
let interval: ReturnType<typeof setInterval>, media: MediaQueryList
const onMedia = (event: MediaQueryListEvent) => { systemDark.value = event.matches }
onMounted(() => { readHash(); media = matchMedia('(prefers-color-scheme: dark)'); systemDark.value = media.matches; media.addEventListener('change', onMedia); interval = setInterval(() => { today.value = dateKey(); timerSeconds.value = timer.seconds(); if (timerRunning.value && (timerDate.value !== today.value || timerSeconds.value >= 86400)) pauseTimer() }, 250); window.addEventListener('hashchange', readHash); window.addEventListener('storage', onStorage); window.addEventListener('beforeunload', beforeUnload); document.addEventListener('visibilitychange', onVisibility) })
onBeforeUnmount(() => { clearInterval(interval); media?.removeEventListener('change', onMedia); window.removeEventListener('hashchange', readHash); window.removeEventListener('storage', onStorage); window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('visibilitychange', onVisibility) })
</script>

<template>
  <a class="skip-link" href="#main" @click.prevent="skipToMain">跳至主要内容</a>
  <div v-if="focusActive" class="focus-layout">
    <header class="focus-topbar"><button class="focus-exit" @click="exitFocus">← 退出专注</button><span v-if="timerOpen" class="focus-timer-status">{{ names[timerSubject] }} · {{ timerRunning ? '计时中' : '计时已暂停' }}</span><details class="focus-options"><summary>阅读设置</summary><div class="theme-group" aria-label="主题"><button v-for="(name,key) in {light:'浅色',dark:'深色',system:'跟随系统'}" :key="key" :aria-pressed="data.settings.theme === key" @click="setTheme(key)">{{ name }}</button></div></details></header>
    <main id="main" class="focus-main" tabindex="-1">
      <div v-if="warning" class="message" role="alert">{{ warning }}<button @click="exportRaw">导出原始存储</button></div>
      <div v-if="notice" class="message" role="status">{{ notice }}<button aria-label="关闭提示" @click="notice = ''">×</button></div>
      <section v-if="courseLoading" class="course-loading" role="status" aria-live="polite"><h1>正在加载第 {{ selectedWeek }} 周课程</h1><p>只加载当前学习周，请稍候。</p></section>
      <section v-else-if="courseError" class="course-load-error" role="alert"><h1>课程暂时没有打开</h1><p>{{ courseError }}</p><p class="help">如果站点刚刚更新，可刷新页面后再试。已经保存的学习记录保留在当前浏览器。</p><button class="primary" @click="loadFocusedCourse">重试加载</button><button @click="exitFocus">返回本周计划</button></section>
      <FocusLesson v-else-if="focusLesson" :key="`${selectedWeek}-${lessonSubject}`" :week="selectedWeek" :subject="lessonSubject" :subject-label="label(lessonSubject)" :lesson="focusLesson" :completed="week.completed" :step="focusStep" @complete="toggleTask" @navigate="changeFocusStep" @exit="exitFocus" />
    </main>
  </div>
  <div v-else class="layout">
    <aside class="sidebar">
      <a class="brand" href="#overview" @click.prevent="choosePage('overview')"><span class="brand-icon" aria-hidden="true">循</span><span>循序<span class="brand-sub">学习是一段长路</span></span></a>
      <p class="nav-caption">我的学习计划</p>
      <nav aria-label="主导航"><a v-for="item in pages" :key="item.id" :href="`#${item.id}`" :class="{ active: page === item.id }" :aria-current="page === item.id ? 'page' : undefined" @click.prevent="choosePage(item.id)"><span class="nav-number">{{ item.mark }}</span>{{ item.label }}<span class="nav-arrow" aria-hidden="true">↗</span></a></nav>
      <div class="sidebar-bottom"><p class="small-label">当前 · 第 {{ data.currentWeek }} 周</p><p>未学完，就留在这一周。<br>进度由你手动决定。</p><div class="theme-group" aria-label="主题"><button :aria-pressed="data.settings.theme === 'light'" @click="setTheme('light')">浅色</button><button :aria-pressed="data.settings.theme === 'dark'" @click="setTheme('dark')">深色</button><button :aria-pressed="data.settings.theme === 'system'" @click="setTheme('system')">跟随系统</button></div><span class="local-label"><i></i>记录仅保存在此浏览器</span></div>
    </aside>
    <div class="workspace"><header class="topbar"><span>2028 高考弹性学习计划</span><span class="topbar-meta">手动进度 / 第 {{ data.currentWeek }} 周</span></header>
      <main id="main" tabindex="-1">
        <div class="page-heading"><div><p class="eyebrow">{{ title.mark }} / STUDY PLAN</p><h1>{{ title.label }}</h1><p class="subtitle">{{ title.subtitle }}</p></div><span class="outline-badge">{{ totalStudyWeeks }} 个学习周 · 自主推进</span></div>
        <div v-if="warning" class="message" role="alert">{{ warning }}<button @click="exportRaw">导出原始存储</button></div>
        <div v-if="notice" class="message" role="status">{{ notice }}<button aria-label="关闭提示" @click="notice = ''">×</button></div>

        <template v-if="page === 'overview'">
          <section class="hero"><div class="hero-copy"><p class="eyebrow">让计划适应掌握程度</p><h2>这一周，<br>先把知识学明白。</h2><p>知识讲解 → 原创例题 → 独立练习 → 复测。<br>学习序号不跟随日历变化，没有强制跳周。</p><button class="primary" @click="openWeek(data.currentWeek, true)">继续第 {{ data.currentWeek }} 周 <span aria-hidden="true">→</span></button></div><div class="countdown learning-progress"><span class="small-label">当前学习序号</span><strong>{{ data.currentWeek }}<small>/ {{ totalStudyWeeks }} 周</small></strong><p>{{ currentCourse.stage }}<br><span>{{ currentCourse.title }}</span></p><div class="countdown-line"></div><span class="small-label">按周计数 · 手动前进 · 随时回看</span></div></section>
          <div class="stats-grid"><article class="stat"><span class="small-label">当前学习周实际时长</span><strong>{{ fmtHours(totalSeconds) }}<small> 小时</small></strong><p>仅记录确认过的真实学习</p></article><article class="stat"><span class="small-label">当前学习周打卡</span><strong>{{ checkedCount }}<small> 项</small></strong><p>勾选不会增加时长或自动前进</p></article><article class="stat"><span class="small-label">累计记录（含旧日志）</span><strong>{{ fmtHours(totalRecordedSeconds) }}<small> 小时</small></strong><p>旧日历日志完整保留</p></article></div>
          <section class="note"><span class="note-symbol" aria-hidden="true">↳</span><div><h3>内容状态清楚可见</h3><p>共 {{ totalStudyWeeks }} 个学习周，已有 {{ curriculumCoverage.completeWeeks.length }} 周八科内容齐全，{{ curriculumCoverage.completeLessons }} 个学科课次提供原创完整基础讲解，共 {{ curriculumCoverage.originalQuestions }} 道基础例题、练习与复测题<span v-if="curriculumCoverage.diagnosticQuestions">，另有 {{ curriculumCoverage.diagnosticQuestions }} 道诊断题</span><span v-if="curriculumCoverage.outlineLessons">；{{ curriculumCoverage.outlineLessons }} 个课次仅有周纲</span><span v-if="curriculumCoverage.pendingLessons">；{{ curriculumCoverage.pendingLessons }} 个课次待补充</span>。每科标注实际状态，未补充的题目不会被伪装为已提供。官方评析外链与原创题分开呈现。</p></div></section>
          <div class="section-title"><h2>第 {{ data.currentWeek }} 周学什么</h2><a href="#roadmap" @click.prevent="choosePage('roadmap')">浏览全部学习周 ↗</a></div>
          <div class="paths-grid"><article v-for="s in subjects" :key="s" class="panel week-preview"><div class="path-heading"><h3>{{ label(s) }}</h3><span class="outline-badge" :class="`status-${(currentCourse.subjects[s]?.status || 'pending')}`">{{ statusNames[(currentCourse.subjects[s]?.status || 'pending')] }}</span></div><p>{{ currentCourse.subjects[s]?.enrichmentTitle || currentCourse.subjects[s]?.title || '课程内容待补充' }}</p><button class="text-button" @click="lessonSubject = s; openWeek(data.currentWeek, true)">打开知识点与练习 →</button></article></div>
          <div class="overview-bottom" style="margin-top:20px"><article class="panel"><p class="eyebrow">自主进度</p><h3>这一周可以学很多次</h3><p>没有日历倒计时和固定月份安排。看过下一周不代表已学习；只有手动按钮会改变当前序号。</p><button class="text-button" @click="choosePage('roadmap')">查看 84 周路线 →</button></article><article class="panel"><p class="eyebrow">选科保持开放</p><h3>{{ thirdName }}</h3><p>语数英物化 + 待确认第三科。生物仅是参考，可改地理或思想政治；核对当地选科与目标专业要求。</p><button class="text-button" @click="choosePage('settings')">调整设置 →</button></article></div>
        </template>

        <template v-else-if="page === 'roadmap'">
          <section class="note"><span class="note-symbol" aria-hidden="true">84</span><div><h3>第 1 周 — 第 84 周</h3><p>编号表示教学顺序，不表示某个日历周。未学完可以停留；浏览后续周纲不会改变已保存的学习进度。各科状态分别显示。</p></div></section>
          <label class="field route-search">查找周编号或知识点<input v-model="routeSearch" type="search" placeholder="例如：函数，或 12"/></label>
          <div class="filter-row" aria-label="阶段筛选"><button :aria-pressed="stageFilter === 'all'" @click="stageFilter = 'all'">全部学习周</button><button v-for="stage in stages" :key="stage" :aria-pressed="stageFilter === stage" @click="stageFilter = stage">{{ stage }}</button></div>
          <p v-if="!curriculum.length" class="pending-copy">课程数据正在接入，尚未显示完整周纲。</p>
          <div class="timeline"><article v-for="item in routeWeeks" :key="item.week" class="month learning-week-row" :class="{ 'current-month': item.week === data.currentWeek }"><div class="month-index"><span>第 {{ item.week }} 周</span><small>{{ item.stage }}</small><span v-if="item.week === data.currentWeek" class="outline-badge">当前学习周</span><button class="text-button" @click="openWeek(item.week)">查看本周 →</button></div><div><h2>{{ item.title }}</h2><p>{{ item.summary }}</p><ul class="route-subjects"><li v-for="s in subjects" :key="s"><strong>{{ label(s) }}</strong><span>{{ item.subjects[s]?.title || '待补充' }}</span><span class="outline-badge" :class="`status-${(item.subjects[s]?.status || 'pending')}`">{{ statusNames[(item.subjects[s]?.status || 'pending')] }}</span></li></ul></div></article></div>
        </template>

        <template v-else-if="page === 'subjects'">
          <section class="note"><span class="note-symbol" aria-hidden="true">↳</span><div><h3>从知识点走到考查方式</h3><p>各科进入学习周查看正文、原创例题与独立练习。每个学习周都可以重复复测；没有智能评分或自动掌握判断。</p></div></section>
          <div class="paths-grid"><article v-for="s in subjects" :key="s" class="panel subject-path"><h2>{{ label(s) }}</h2><p>{{ paths[s].goal }}</p><ol><li v-for="(step,i) in paths[s].steps" :key="step"><span>{{ String(i+1).padStart(2,'0') }}</span>{{ step }}</li></ol><button class="text-button" @click="lessonSubject = s; openWeek(data.currentWeek, true)">进入第 {{ data.currentWeek }} 周课程 →</button></article></div>
          <section class="note" style="margin-top:22px"><span class="note-symbol" aria-hidden="true">↳</span><div><h3>往年题参考的范围</h3><p>{{ sourceScope }}</p><p>所有内置基础例题标为原创。官方试题评析只提供出处、考点概述与外链，不假装已经取得原题全文或全套答案。</p></div></section>
        </template>

        <template v-else-if="page === 'first'">
          <section class="note"><span class="note-symbol" aria-hidden="true">04</span><div><h3>按顺序完成基础，再检查掌握</h3><p>第 1—4 周的详细课程包含原创讲解和题目。可随时打开，不会按日期自动跳到某一周。</p></div></section>
          <div class="first-grid"><article v-for="number in 4" :key="number" class="panel"><p class="eyebrow">第 {{ number }} 周</p><h2>{{ getStudyWeek(number).title }}</h2><p>{{ getStudyWeek(number).summary }}</p><button @click="openWeek(number, true)">打开第 {{ number }} 周课程 →</button></article></div>
          <details v-if="data.firstCompleted.length" class="panel legacy-first"><summary>旧版首四周打卡 · {{ data.firstCompleted.length }} 项（已保留）</summary><p class="help">这些是旧版通用任务记录，独立保留，不冒充新版详细课程已完成。</p><template v-for="(w,index) in firstWeeks" :key="w.title"><h3>{{ w.title }}</h3><label v-for="(task,i) in w.tasks.filter((_,i) => data.firstCompleted.includes(`first-${index+1}-${i}`))" :key="task" class="check-row"><span aria-hidden="true">✓</span><span>{{ task }}<small>旧打卡记录 {{ i+1 }}</small></span></label></template></details>
        </template>

        <template v-else-if="page === 'weekly'">
          <div class="week-toolbar"><div class="week-switch"><button aria-label="浏览上一学习周" :disabled="timerOpen || selectedWeek <= 1" @click="browseWeek(-1)">←</button><label class="week-select">学习序号<select v-model.number="selectedWeek" aria-label="浏览学习周" :disabled="timerOpen"><option v-for="number in totalStudyWeeks" :key="number" :value="number">第 {{ number }} 周</option></select></label><button aria-label="浏览下一学习周" :disabled="timerOpen || selectedWeek >= totalStudyWeeks" @click="browseWeek(1)">→</button><button :disabled="timerOpen" @click="selectedWeek = data.currentWeek">当前学习周</button></div><span class="outline-badge">已保存进度 · 第 {{ data.currentWeek }} 周</span></div>
          <section class="note"><span class="note-symbol" aria-hidden="true">↳</span><div><h3>正在浏览第 {{ selectedWeek }} 周 · {{ course.title }}</h3><p>{{ course.summary }} 学习周与日志日期分开保存，浏览不会自动前进或标记完成。</p><button v-if="selectedWeek !== data.currentWeek" class="text-button" :disabled="timerOpen" @click="setCurrentWeek(selectedWeek)">手动将第 {{ selectedWeek }} 周设为当前学习周 →</button><button v-else-if="data.currentWeek < totalStudyWeeks" class="text-button" :disabled="timerOpen" @click="setCurrentWeek(data.currentWeek+1)">我准备好了，前进到第 {{ data.currentWeek+1 }} 周 →</button></div></section>
          <div class="subject-tabs filter-row" aria-label="课程科目"><button v-for="s in subjects" :key="s" :aria-pressed="lessonSubject === s" @click="lessonSubject = s">{{ label(s) }}</button></div>
          <section class="panel study-entry"><p class="eyebrow">{{ label(lessonSubject) }} · 第 {{ selectedWeek }} 周</p><h2>{{ course.subjects[lessonSubject]?.enrichmentTitle || course.subjects[lessonSubject]?.title || '课程内容待补充' }}</h2><p>一次专心学一节。进入后收起周计划和记录，随时可以退出。</p><button class="primary start-focus" @click="startFocus">开始专注学习 →</button></section>
          <section class="record-section"><div class="section-title"><h2>第 {{ selectedWeek }} 周 · 实际学习记录</h2><span class="small-label">日期只作日志</span></div><div class="weekly-summary"><div><span class="small-label">实际学习</span><strong>{{ fmtHours(totalSeconds) }} <small>小时</small></strong></div><div><span class="small-label">手动打卡 {{ checkedCount }} 项</span><p class="help">保持当前学习周，不受日期影响</p></div></div>
            <div class="weekly-grid"><section class="panel"><p class="eyebrow">FOCUS</p><h2>记录实际学习</h2><label class="field">学习科目<select v-model="selectedSubject" :disabled="timerOpen"><option v-for="s in subjects" :key="s" :value="s">{{ label(s) }}{{ s === data.settings.third && !data.settings.thirdConfirmed ? '（生物参考）' : '' }}</option></select></label><div class="timer"><span class="small-label">{{ timerOpen ? `第 ${timerWeek} 周 · ${names[timerSubject]} · 日志 ${timerDate}` : '从实际开始学习时计时' }}</span><strong aria-live="off">{{ clock }}</strong><div class="button-row"><button v-if="!timerRunning" class="primary" @click="startTimer">{{ timerSeconds > 0 ? '继续计时' : '开始计时' }}</button><button v-else class="primary" @click="pauseTimer">暂停计时</button><button :disabled="timerSeconds < 1" @click="saveTimer">确认学习并保存</button></div><button v-if="timerOpen" class="text-button" @click="discardTimer">舍弃本次计时</button><p class="help">后台自动暂停；只有确认实际学习才保存。计时不会决定学习序号，刷新会丢弃未保存计时。</p></div><form @submit.prevent="manualLog"><h3>手动补录</h3><label class="field">日志日期<input v-model="logDate" type="date" min="2000-01-01" :max="today" required/></label><label class="field">实际分钟数<input v-model="minutes" type="number" inputmode="numeric" min="1" max="1440" step="1" placeholder="实际学习分钟" required/></label><button class="full-width" type="submit">确认并添加实际时长</button></form></section><section class="panel session-panel"><div class="section-title"><h2>学习日志</h2><span class="small-label">{{ week.sessions.length }} 条</span></div><div v-if="!week.sessions.length" class="empty-state"><h3>还没有学习记录</h3><p>完成学习后确认保存或手动补录。<br>没有预填或自动生成时长。</p></div><ul v-else class="session-list"><li v-for="session in [...week.sessions].reverse()" :key="session.id"><span>{{ session.date }}<small>{{ session.source === 'manual' ? '手动补录' : '确认计时' }}</small></span><strong>{{ names[session.subject] }}</strong><span>{{ Math.floor(session.seconds/60) }} 分 {{ session.seconds%60 }} 秒</span><button :aria-label="`删除${session.date}${names[session.subject]}学习记录`" @click="removeSession(session.id)">删除</button></li></ul><label class="field">可选建议配额<select aria-label="本学习周建议方案" :value="week.workload" @change="selectWorkload"><option v-for="(name,key) in workloadNames" :key="key" :value="key">{{ name }} · {{ workloadHours[key] }} 小时建议</option></select></label><p class="help">{{ plannedHours }} 小时是可选建议，不决定课程周序号；复习与测试包含在总量内。</p></section></div>
          </section>
        </template>

        <template v-else-if="page === 'settings'">
          <div class="settings-grid"><section class="panel"><p class="eyebrow">PLAN</p><h2>计划设置</h2><p class="help">当前学习序号：第 {{ data.currentWeek }} 周。手动进入学习周推进，没有日历绑定或倒计时。</p><label class="field">第三科参考<select v-model="data.settings.third" :disabled="timerOpen"><option value="biology">生物（初始占位）</option><option value="geography">地理</option><option value="politics">思想政治</option></select></label><label class="check-row"><input v-model="data.settings.thirdConfirmed" type="checkbox"/><span>我已核对官方选科与专业要求，暂定这门第三科</span></label><p class="help">生物、地理和思想政治有各自课程，切换不会复用生物内容，历史记录保留。不能根据原科类直接认定选科或认为某科天然容易赋分。</p><label class="field">新学习周默认建议<select v-model="data.settings.workload"><option v-for="(name,key) in workloadNames" :key="key" :value="key">{{ name }} · {{ workloadHours[key] }} 小时建议</option></select></label><p class="help">已有学习周保留自己的方案；建议不决定进度，连续难以完成时按实际情况调整。</p></section><div><section class="panel"><p class="eyebrow">APPEARANCE</p><h2>显示主题</h2><div class="theme-options"><button v-for="(name,key) in {light:'浅色',dark:'深色',system:'跟随系统'}" :key="key" :aria-pressed="data.settings.theme === key" @click="setTheme(key)"><span class="theme-preview" :class="key" aria-hidden="true"></span>{{ name }}</button></div></section><section class="panel backup-panel"><p class="eyebrow">LOCAL DATA · V2</p><h2>数据备份</h2><p>学习序号、打卡、时长、主题和旧日志都保存在此浏览器。v1 备份可兼容导入，v2 导出完整保留历史记录。</p><div class="button-row"><button class="primary" @click="exportData">导出 JSON 备份</button><button :disabled="timerOpen" @click="fileInput?.click()">导入 JSON 备份</button></div><input ref="fileInput" class="hidden-input" type="file" accept=".json,application/json" aria-label="选择 JSON 备份" @change="importFile"/><p class="help">导入限 5 MB，先校验再确认覆盖。未保存计时不在备份中。更换浏览器或清理站点前请导出。</p><p class="privacy-label">无本站后端 · 无分析埋点 · AI 仅主动提问联网</p></section></div></div>
          <section class="panel legacy-panel"><h2>旧版日历周日志</h2><p class="help">已保留 {{ legacyEntries.length }} 个旧日历周和 {{ data.firstCompleted.length }} 项旧首四周打卡。旧日志不会被猜测分配到学习序号；可以展开回看或通过 v2 备份完整导出。</p><details v-for="[key,oldWeek] in legacyEntries" :key="key"><summary>历史日志 {{ key }} · {{ oldWeek.completed.length }} 项打卡 · {{ fmtHours(oldWeek.sessions.reduce((n,s)=>n+s.seconds,0)) }} 小时</summary><ul><li v-for="task in oldWeek.completed" :key="task">✓ {{ names[task.split('-')[0] as SubjectId] }} · {{ task.endsWith('core') ? '学习与练习' : '复习与订正' }}</li><li v-for="session in oldWeek.sessions" :key="session.id">{{ session.date }} · {{ names[session.subject] }} · {{ session.seconds }} 秒 · {{ session.source === 'manual' ? '手动补录' : '确认计时' }}</li></ul></details><p v-if="!legacyEntries.length" class="pending-copy">没有旧日历周日志。</p></section>
          <section class="note"><span class="note-symbol" aria-hidden="true">↳</span><div><h3>学习建议与来源的边界</h3><p>不保证考试成绩或录取，不把历史分数当未来保证线。没有智能评分和赋分预测；报考、选科与考试安排以当地当年官方发布为准。</p><p>第三方试题与官方评析不受 MIT 再授权。本站保存来源索引与短概述，原创题与往年来源明确区分。</p></div></section>
        </template>
        <footer><span>循序 · 把这一周学明白。</span><span>按周计数 / 本地记录 / 手动推进</span></footer>
      </main>
    </div>
  </div>
  <dialog v-if="pendingImport" ref="importDialog" class="modal" aria-labelledby="import-title" @keydown.tab="trapImportFocus" @cancel.prevent="pendingImport = null"><p class="eyebrow">IMPORT BACKUP</p><h2 id="import-title">确认覆盖本机数据？</h2><p>备份校验通过：当前序号第 {{ pendingImport.currentWeek }} 周，{{ Object.keys(pendingImport.weeks).length }} 个学习周记录，{{ Object.keys(pendingImport.legacy.weeks).length }} 个旧日历周，{{ pendingImport.firstCompleted.length }} 项旧首四周打卡。当前数据将被替换。</p><p class="help">可以先取消并导出当前备份，不向服务器上传数据。</p><div class="button-row"><button autofocus @click="pendingImport = null">取消，保留当前数据</button><button class="primary" @click="applyImport">确认覆盖并导入</button></div></dialog>
</template>
