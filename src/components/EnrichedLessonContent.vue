<script setup lang="ts">
import { computed } from 'vue'
import type { CumulativeReviewMap, EnrichedLesson, EnrichedQuestion, StaticLessonFigure } from '../curriculum/enriched-types'
import OriginalProblem from './OriginalProblem.vue'
import LessonDiagram from './LessonDiagram.vue'
import StaticLessonFigureView from './StaticLessonFigure.vue'
const props = defineProps<{ lesson: EnrichedLesson; step: string; figures?: StaticLessonFigure[]; reviewMap?: CumulativeReviewMap }>()
const emit = defineEmits<{ navigate: [step: string] }>()
const section = computed(() => props.lesson.sections.find(section => section.id === props.step))
const question = computed(() => [...props.lesson.workedExamples, ...props.lesson.practice].find(problem => problem.id === props.step))
const example = computed(() => props.lesson.workedExamples.some(problem => problem.id === props.step))
const problem = (question: EnrichedQuestion) => ({ ...question, solution: question.steps })
const questionTitle = (id: string) => props.lesson.quiz.questions.find(question => question.id === id)?.title || id
const sectionTitle = (id: string) => props.lesson.sections.find(section => section.id === id)?.title || id
const figuresForQuestion = (id: string) => (props.figures || []).filter(figure => figure.linkedQuestionIds.includes(id))
const relevantFigures = computed(() => (props.figures || []).filter(figure => (!figure.answerOnly && figure.linkedSectionIds.includes(props.step)) || figure.linkedQuestionIds.includes(props.step)))
const relevantDiagrams = computed(() => props.lesson.diagrams?.filter(diagram => diagram.linkedSectionIds.includes(props.step) && !(props.figures || []).some(figure => figure.id === diagram.id)) || [])
</script>
<template>
  <div class="enriched-content">
    <template v-if="step === 'prepare'">
      <p class="help">第{{ lesson.week }}周深化试点 · 原创基础课程</p>
      <h3>这节课要学会什么</h3><ul><li v-for="item in lesson.objectives" :key="item">{{ item }}</li></ul>
      <h3>先确认这些基础</h3><ul><li v-for="item in lesson.prerequisites" :key="item">{{ item }}</li></ul>
      <p v-if="lesson.safetyScope" class="content-warning">{{ lesson.safetyScope }}</p><p v-if="lesson.audioStatus" class="content-warning">{{ lesson.audioStatus }}</p>
      <h3>给自己留出的时间</h3><p>核心内容约 {{ lesson.budget.coreMinutes }} 分钟，包含自测、学习、练习和订正，可以拆成多次完成。</p><p class="help">{{ lesson.budget.busyPolicy }}</p>
      <details class="reading-detail"><summary>查看时间安排</summary><ul><li v-for="segment in lesson.budget.segments" :key="segment.id">{{ segment.title }} · {{ segment.minutes }} 分钟</li></ul><p class="help">可选拓展约 {{ lesson.budget.extensionMinutes }} 分钟，不计核心达标。</p></details>
    </template>
    <template v-else-if="step === 'diagnostic'">
      <p>{{ lesson.diagnostic.instructions }}</p><OriginalProblem hide-id v-for="item in lesson.diagnostic.questions" :key="item.id" :problem="problem(item)" label="原创课前自测 · 不计过关分" reveal-label="做完后核对答案与解析"><template #solution-media><StaticLessonFigureView v-for="figure in figuresForQuestion(item.id)" :key="figure.id" :figure="figure"/></template></OriginalProblem>
      <details class="reading-detail"><summary>核对后，看看该从哪里开始</summary><article v-for="route in lesson.diagnostic.routes" :key="route.when" class="remediation-item"><h3>{{ route.when }}</h3><p>{{ route.action }}</p><button v-for="id in route.sectionIds" :key="id" class="text-button" @click="emit('navigate', id)">回看：{{ sectionTitle(id) }} →</button></article></details>
    </template>
    <template v-else-if="section">
      <p v-if="section.level === 'remediation'" class="help">基础补救 · 根据自测情况回看</p><p v-if="section.level === 'extension'" class="help">可选拓展 · 不计核心达标</p>
      <p v-for="paragraph in section.paragraphs" :key="paragraph" class="math-text">{{ paragraph }}</p>
      <StaticLessonFigureView v-for="figure in relevantFigures" :key="figure.id" :figure="figure"/>
      <LessonDiagram v-for="diagram in relevantDiagrams" :key="diagram.id" :diagram="diagram"/>
      <ul v-if="section.keyPoints.length"><li v-for="point in section.keyPoints" :key="point">{{ point }}</li></ul>
      <div class="lesson-checkpoint-question"><h3>停一停，自己试着说清楚</h3><p class="math-text">{{ section.checkpoint.question }}</p><details><summary>想好后核对</summary><div class="solution"><p class="math-text">{{ section.checkpoint.answer }}</p><p class="math-text">{{ section.checkpoint.explanation }}</p></div></details></div>
    </template>
    <template v-else-if="question">
      <p class="help">{{ example ? '先自己试做，再展开步骤，比较每一步的理由。' : '先独立作答，再展开答案订正。' }}{{ question.level === 'extension' ? '本题是可选拓展，不计核心达标。' : '' }}</p>
      <OriginalProblem hide-id hide-title :problem="problem(question)" :label="example ? '原创例题（非历年真题）' : '原创独立练习（非历年真题）'" :reveal-label="example ? '展开例题解析' : '完成后核对答案与解析'"><template #solution-media><StaticLessonFigureView v-for="figure in relevantFigures" :key="figure.id" :figure="figure"/></template></OriginalProblem>
    </template>
    <template v-else-if="step === 'quiz'">
      <p>{{ lesson.quiz.instructions }}</p><p class="help">共 {{ lesson.quiz.totalPoints }} 分。独立作答后按评分点自行核对，页面不提供自动评分。</p>
      <OriginalProblem hide-id v-for="item in lesson.quiz.questions" :key="item.id" :problem="problem(item)" :label="reviewMap ? '原创累计诊断（非历年真题）' : '原创短测（非历年真题）'" :reveal-label="reviewMap ? '累计诊断完成后核对答案与评分点' : '短测完成后核对答案与评分点'"><template #solution-media><StaticLessonFigureView v-for="figure in figuresForQuestion(item.id)" :key="figure.id" :figure="figure"/></template></OriginalProblem>
    </template>
    <template v-else-if="step === 'review'">
      <h3>{{ lesson.reviewActivity?.title || '按错因订正' }}</h3><ul v-if="lesson.reviewActivity"><li v-for="item in lesson.reviewActivity.instructions" :key="item">{{ item }}</li></ul>
      <article v-for="item in lesson.quiz.remediation" :key="item.questionIds.join('-')" class="remediation-item"><p>{{ item.questionIds.map(questionTitle).join('、') }}：{{ item.action }}</p><button v-for="id in item.sectionIds" :key="id" class="text-button" @click="emit('navigate', id)">回看：{{ sectionTitle(id) }} →</button></article>
      <details class="reading-detail"><summary>检查常见误区</summary><article v-for="item in lesson.misconceptions" :key="item.wrong" class="remediation-item"><h3>{{ item.wrong }}</h3><p>{{ item.why }}</p><p>{{ item.right }}</p></article></details>
      <details v-if="reviewMap" class="reading-detail cumulative-review-map"><summary>做完累计诊断后，查看第1—{{ lesson.week }}周技能回查</summary>
        <p class="help">这是本节 {{ reviewMap.totalPoints }} 分累计诊断的回查表，已计入原有 {{ reviewMap.minutes }} 分钟测评安排，不是额外试卷。每项分值只计一次；同一技能关联多个周次，不重复加分。先独立完成并核对答案，再按薄弱项回看本周讲解。</p>
        <article v-for="item in reviewMap.questions" :key="item.questionId" class="remediation-item"><h3>{{ item.title }} · {{ item.points }} 分</h3>
          <ul><li v-for="(skill, index) in item.skills" :key="index"><p>{{ skill.skill }} · {{ skill.points }} 分 · 关联第 {{ skill.weeks.join('、') }} 周</p><button v-for="id in skill.sectionIds" :key="id" class="text-button" @click="emit('navigate', id)">回看：{{ sectionTitle(id) }} →</button></li></ul>
        </article>
      </details>
      <h3>自行核对掌握情况</h3><p>{{ reviewMap ? '累计诊断' : '短测' }}参考标准：{{ lesson.quiz.passRule.minScore }} / {{ lesson.quiz.totalPoints }} 分，并满足以下关键检查。</p><ul><li v-for="item in lesson.quiz.passRule.requiredChecks" :key="item">{{ item }}</li></ul><ul><li v-for="item in lesson.mastery" :key="item">{{ item }}</li></ul><p>{{ lesson.nextStep }}</p><p class="help">看过答案或完成打卡不代表已经掌握；没有自动评分、自动达标或自动跳周。</p>
    </template>
  </div>
</template>
