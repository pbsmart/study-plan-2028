<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { Component } from 'vue'
import type { SubjectId } from '../model'
import type { SubjectWeek } from '../curriculum/types'
import { effectiveStatus, statusNames } from '../curriculum/types'
import { lessonSteps } from '../focus'
import type { LessonSection } from '../focus'
import EnrichedLessonContent from './EnrichedLessonContent.vue'
import WeekLesson from './WeekLesson.vue'
import StudyNotebook from './StudyNotebook.vue'
import LessonPodcast from './LessonPodcast.vue'
import { inlinePodcastSteps, podcastFor } from '../podcast/catalog'

const props = defineProps<{ week: number; subject: SubjectId; subjectLabel: string; lesson?: SubjectWeek; completed: string[]; step: string }>()
const emit = defineEmits<{ complete: [id: string, checked: boolean]; navigate: [step: string]; exit: [] }>()
const steps = computed(() => lessonSteps(props.lesson))
const index = computed(() => Math.max(0, steps.value.findIndex(step => step.id === props.step)))
const current = computed(() => steps.value[index.value]!)
const heading = ref<HTMLElement | null>(null)
const directory = ref<HTMLDetailsElement | null>(null)
const desktopDirectory = ref(false)
let directoryMedia: MediaQueryList | undefined
const updateDirectory = () => { desktopDirectory.value = !!directoryMedia?.matches }
const groups = computed(() => {
  const enriched = props.lesson?.enrichment
  const category = (id: string) => {
    if (id === 'prepare' || (id === 'diagnostic' && enriched)) return '学习准备'
    if (id === 'knowledge' || enriched?.sections.some(item => item.id === id)) return '讲解'
    if (id === 'examples' || enriched?.workedExamples.some(item => item.id === id)) return '例题'
    if (id === 'practice' || enriched?.practice.some(item => item.id === id)) return '独立练习'
    return '测评与订正'
  }
  return ['学习准备', '讲解', '例题', '独立练习', '测评与订正'].map(title => ({ title, items: steps.value.filter(step => category(step.id) === title) })).filter(group => group.items.length)
})
const aiComponent = shallowRef<Component | null>(null)
const aiOpen = ref(false), aiLoading = ref(false), aiLoadError = ref('')
const aiTrigger = ref<HTMLButtonElement | null>(null)
async function openAi() {
  if (aiLoading.value) return
  aiLoading.value = true; aiLoadError.value = ''
  const route = `${props.week}/${props.subject}/${props.step}`
  try {
    aiComponent.value ||= (await import('./LearningAiDialog.vue')).default
    if (route === `${props.week}/${props.subject}/${props.step}` && aiTrigger.value?.isConnected) aiOpen.value = true
  } catch { aiLoadError.value = 'AI 问答加载失败，请检查网络后再次点击。课程仍可照常阅读。' }
  finally { aiLoading.value = false }
}
async function closeAi() { aiOpen.value = false; await nextTick(); aiTrigger.value?.focus() }
watch(() => `${props.week}/${props.subject}/${props.step}`, () => { aiOpen.value = false; aiLoadError.value = '' })
const checkpointLabels = { knowledge: '知识学习', example: '例题学习', practice: '练习与订正', retest: '复测与订正' }
const checkpointLabel = computed(() => current.value.checkpoint ? checkpointLabels[current.value.checkpoint] : '')
const externalSources = computed(() => props.lesson?.enrichment?.sourcePolicy.externalSources.filter(source => /^https?:\/\//.test(source.url)) || [])
const status = computed(() => effectiveStatus(props.lesson))
const checkpointId = computed(() => current.value.checkpoint ? `w${props.week}-${props.subject}-${current.value.checkpoint}` : '')
async function focusHeading() { await nextTick(); heading.value?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }) }
function toggleDirectory(event: Event) { if (desktopDirectory.value) event.preventDefault() }
function navigate(step: string) { if (directory.value && !desktopDirectory.value) directory.value.open = false; emit('navigate', step); void focusHeading() }
onMounted(() => { void focusHeading(); directoryMedia = matchMedia('(min-width: 980px)'); updateDirectory(); directoryMedia.addEventListener('change', updateDirectory) })
onBeforeUnmount(() => directoryMedia?.removeEventListener('change', updateDirectory))
watch(() => props.step, focusHeading)
</script>

<template>
  <article class="focus-reader">
    <aside class="course-outline" aria-label="课程学习目录">
      <p class="course-week">第 {{ week }} 周 · {{ subjectLabel }}</p>
      <p class="outline-course-title">{{ lesson?.enrichment?.title || lesson?.title }}</p>
      <details ref="directory" class="focus-directory" :open="desktopDirectory">
        <summary @click="toggleDirectory">本课目录 · {{ current.title }}</summary>
        <nav aria-label="本课目录"><section v-for="group in groups" :key="group.title" class="outline-group"><h2>{{ group.title }}</h2><button v-for="item in group.items" :key="item.id" :aria-current="current.id === item.id ? 'step' : undefined" @click="navigate(item.id)">{{ item.title }}</button></section></nav>
      </details>
      <button class="text-button outline-exit" @click="emit('exit')">返回本周课程 →</button>
    </aside>
    <div class="focus-content">
    <header class="focus-title">
      <p class="eyebrow">第 {{ week }} 周 · {{ subjectLabel }}</p>
      <h1>{{ lesson?.enrichment?.title || lesson?.title || '本学科内容待补充' }}</h1>
      <p v-if="status !== 'complete'" class="content-warning">{{ statusNames[status] }}。尚未提供的正文或题目不会被视为已完成。</p>
      <p v-if="lesson?.trainingScope" class="focus-scope">{{ lesson.trainingScope }}</p>
      <p v-if="subject === 'english' && (lesson?.audioStatus || lesson?.enrichment?.audioStatus)" class="focus-scope">听力文字预训练，无音频；完成本页不代表真实听辨达标。</p>
    </header>
    <div class="focus-position" aria-label="当前阅读位置">
      <span>第 {{ index + 1 }} / {{ steps.length }} 节 · {{ current.title }}</span>
      <span class="focus-position-note">按自己的节奏</span>
    </div>
    <div class="focus-progress" aria-hidden="true"><span :style="{ width: `${(index + 1) / steps.length * 100}%` }"></span></div>
    <p v-if="aiLoadError" class="focus-ai-load-error" role="alert">{{ aiLoadError }}</p>
    <component :is="aiComponent" v-if="aiOpen && aiComponent" :lesson="lesson" :step="current.id" :week="week" :subject="subject" :subject-label="subjectLabel" :step-title="current.title" @close="closeAi"/>
    <section :key="current.id" class="focus-section" :aria-labelledby="`focus-step-${current.id}`">
      <div class="focus-step-heading"><div><p class="eyebrow">现在学这一节</p><h2 :id="`focus-step-${current.id}`" ref="heading" tabindex="-1" class="focus-section-title">{{ current.title }}</h2></div></div>
      <LessonPodcast v-if="current.id === 'prepare' || (podcastFor(week, subject) && inlinePodcastSteps.includes(current.id))" :week="week" :subject="subject" :lesson="lesson" :overview="current.id === 'prepare'" @navigate="navigate"/>
      <EnrichedLessonContent v-if="lesson?.enrichment" :lesson="lesson.enrichment" :figures="lesson.enrichmentFigures" :review-map="lesson.enrichmentReviewMap" :step="current.id" @navigate="navigate"/>
      <WeekLesson v-else :week="week" :subject="subject" :lesson="lesson" :completed="completed" :section="current.id as LessonSection" @navigate="navigate" />
      <label v-if="checkpointId" class="check-row focus-checkpoint"><input type="checkbox" :checked="completed.includes(checkpointId)" @change="emit('complete', checkpointId, ($event.target as HTMLInputElement).checked)"/><span>{{ lesson?.enrichment ? '本周学习打卡 · ' : '我已实际完成' }}{{ checkpointLabel }}<small>{{ lesson?.enrichment ? '沿用本周历史打卡，不代表深化内容已完成，请按新标准重新核对。' : '仅保存打卡，不计时、不判定掌握，也不自动跳周。' }}{{ (subject === 'english' && (lesson?.audioStatus || lesson?.enrichment?.audioStatus)) ? '听力打卡仅表示文字预训练。' : '' }}</small></span></label>
      <div class="focus-help"><button ref="aiTrigger" type="button" :disabled="aiLoading" aria-haspopup="dialog" @click="openAi">{{ aiLoading ? '正在打开…' : '这一步没懂' }}</button><span class="help">按需打开 AI 答疑，发送前可核对资料范围。</span></div>
    </section>
    <StudyNotebook :key="`${week}-${subject}-${current.id}`" :week="week" :subject="subject" :step="current.id" :title="current.title"/>
    <nav class="focus-pagination" aria-label="课内上一节与下一节">
      <button :disabled="index === 0" @click="navigate(steps[index - 1]!.id)">← 上一节</button>
      <button v-if="index < steps.length - 1" class="primary" @click="navigate(steps[index + 1]!.id)">下一节 →</button>
      <button v-else class="primary" @click="emit('exit')">返回本周计划</button>
    </nav>
    <details class="focus-source-details"><summary>课程说明与来源</summary><p v-if="lesson?.enrichment" class="help">{{ lesson.enrichment.sourcePolicy.authorship }} {{ lesson.enrichment.sourcePolicy.examStatus }}</p><p v-for="source in externalSources" :key="source.id" class="help"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }} ↗</a> · {{ source.scopeNote }}</p><p class="help">教学编排、题目及解析为原创；明确标源的古诗文为公版原典。官方评析只作考点参考，未提供原题全文，不代表本节必须先学会这些高考题。</p><WeekLesson :week="week" :subject="subject" :lesson="lesson" :completed="completed" section="sources"/></details>
    </div>
  </article>
</template>
