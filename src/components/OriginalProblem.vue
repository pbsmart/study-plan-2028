<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { OriginalProblem } from '../curriculum/types'
const props = defineProps<{ problem: OriginalProblem; label: string; revealLabel: string; hideTitle?: boolean; hideId?: boolean; interactive?: boolean; active?: boolean; reviewSteps?: { id: string; title: string }[] }>()
defineEmits<{ navigate: [step: string] }>()
const draft = ref(''), onPaper = ref(false), hint = ref(false), feedback = ref(''), selfAssessment = ref('')
const answer = ref<HTMLDetailsElement | null>(null)
watch([draft, onPaper], () => { if (feedback.value.startsWith('先写下')) feedback.value = '' })
function check() {
  if (!draft.value.trim() && !onPaper.value) { feedback.value = '先写下你的作答，或确认已在纸上完成。'; return }
  feedback.value = '请逐项对照参考答案与评分点，再自行判断。这道题不自动判分。'
  if (answer.value) answer.value.open = true
}
watch(() => props.active, () => { if (answer.value) answer.value.open = false; feedback.value = ''; selfAssessment.value = '' })
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()
const extraContext = computed(() => [...new Set([props.problem.sourceStory, props.problem.sourcePassage, props.problem.quotedSource?.text].filter((s): s is string => !!s))].filter(s => !normalize(props.problem.prompt).includes(normalize(s))))
const extraSamples = computed(() => [...new Set([props.problem.sampleContinuation, props.problem.sampleText].filter((s): s is string => !!s))].filter(s => !normalize(props.problem.answer).includes(normalize(s))))
const extraStarters = computed(() => (props.problem.paragraphStarters || []).filter(s => !normalize(props.problem.prompt).includes(normalize(s))))
</script>
<template>
  <article class="problem-card">
    <span class="original-label">{{ label }}<span v-if="problem.points !== undefined"> · {{ problem.points }} 分</span></span>
    <h3 v-if="!hideTitle"><span v-if="problem.points !== undefined && !hideId" class="problem-id">{{ problem.id }} · </span>{{ problem.title }}</h3>
    <p v-if="problem.quotedSource" class="quotation-attribution">{{ problem.quotedSource.author }}《{{ problem.quotedSource.title }}》 · {{ problem.quotedSource.copyrightStatus === 'public_domain' ? '公版引文（原典非本课原创）' : '标源引文（原典非本课原创）' }}</p>
    <p v-for="context in extraContext" :key="context" class="math-text problem-context">{{ context }}</p>
    <p class="math-text problem-prompt">{{ problem.prompt }}</p>
    <div v-if="extraStarters.length"><h4>两段给定首句</h4><p v-for="starter in extraStarters" :key="starter" class="math-text">{{ starter }}</p></div>
    <p v-if="problem.wordRange?.length" class="help">本题词数范围：{{ problem.wordRange.join('–') }} 词</p>
    <p v-if="problem.characterRange?.length" class="help">本题汉字数范围：{{ problem.characterRange.join('–') }} 字</p>
    <p v-if="problem.characterLimit !== undefined" class="help">本题长度上限：{{ problem.characterLimit }} 字</p>
    <p v-if="problem.passageWordCount !== undefined" class="help">原文参考词数：{{ problem.passageWordCount }} 词</p>
    <p v-if="problem.wordCountNote" class="help">{{ problem.wordCountNote }}</p>
    <p v-if="problem.characterCountNote" class="help">{{ problem.characterCountNote }}</p>
    <p v-if="problem.sources?.length" class="help"><a v-for="(url,i) in problem.sources" :key="url" :href="url" target="_blank" rel="noopener noreferrer">原文核验来源 {{ i+1 }} ↗ </a></p>
    <template v-if="interactive">
      <label class="practice-response" :for="`response-${problem.id}`">你的作答<textarea :id="`response-${problem.id}`" v-model="draft" maxlength="12000" rows="5" placeholder="写下答案、理由和必要的计算过程；也可以先在纸上完成。"/></label>
      <p class="help practice-draft-note">作答框是临时草稿，离开或刷新会清空。需要保留的理解与错因可保存到下方笔记。</p>
      <label class="check-row paper-answer"><input v-model="onPaper" type="checkbox"/><span>我已在纸上独立作答</span></label>
      <div class="practice-support"><button type="button" :aria-expanded="hint" @click="hint = !hint">{{ hint ? '收起提示' : '看提示' }}</button><button v-for="item in reviewSteps" :key="item.id" type="button" class="text-button" @click="$emit('navigate', item.id)">回看讲解：{{ item.title }} →</button></div>
      <p v-if="hint" class="practice-hint">先列出题目给出的条件和要回答的问题，再写出每一步的依据。计算题检查单位与方向；论述和写作题检查是否回应了题目要求。需要时回看相关讲解。</p>
      <div class="practice-check"><p class="help">开放作答 · 按参考答案与评分点自行核对</p><button class="primary" type="button" @click="check">检查答案</button></div>
      <p v-if="feedback" class="practice-feedback" role="status">{{ feedback }}</p>
    </template>
    <details ref="answer" class="problem-answer"><summary>{{ revealLabel }}</summary><div class="solution">
      <p class="math-text"><strong>答案：</strong>{{ problem.answer }}</p>
      <slot name="solution-media"/>
      <p v-for="sample in extraSamples" :key="sample" class="math-text">{{ sample }}</p>
      <p v-if="problem.sampleWordCount !== undefined" class="help">范文参考词数：{{ problem.sampleWordCount }} 词</p>
      <p v-if="problem.sampleCharacterCount !== undefined" class="help">参考段汉字数：{{ problem.sampleCharacterCount }} 字</p>
      <p v-if="problem.sampleCharacterCountWithPunctuation !== undefined" class="help">含标点参考字符数：{{ problem.sampleCharacterCountWithPunctuation }}</p>
      <ol><li v-for="step in problem.solution" :key="step" class="math-text">{{ step }}</li></ol>
      <template v-if="problem.scoring?.length"><h4>逐点评分（自行核对）</h4><ul><li v-for="(rule,i) in problem.scoring" :key="i">{{ rule.points }} 分 · {{ rule.criterion }}</li></ul></template>
      <p v-if="problem.commonErrors?.length"><strong>常见错误：</strong>{{ problem.commonErrors.join('；') }}</p>
    </div></details>
    <fieldset v-if="interactive && feedback.startsWith('请逐项')" class="practice-self-review"><legend>核对后自评（不会自动打卡）</legend><label v-for="option in ['能独立说明理由', '需要订正后再练', '还没想清楚']" :key="option"><input v-model="selfAssessment" type="radio" :name="`review-${problem.id}`" :value="option"/>{{ option }}</label></fieldset>
  </article>
</template>
