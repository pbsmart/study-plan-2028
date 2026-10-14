<script setup lang="ts">
import { computed } from 'vue'
import type { OriginalProblem } from '../curriculum/types'
const props = defineProps<{ problem: OriginalProblem; label: string; revealLabel: string; hideTitle?: boolean; hideId?: boolean }>()
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
    <details><summary>{{ revealLabel }}</summary><div class="solution">
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
  </article>
</template>
