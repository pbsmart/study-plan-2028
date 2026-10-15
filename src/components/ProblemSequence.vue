<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { OriginalProblem as Problem } from '../curriculum/types'
import OriginalProblem from './OriginalProblem.vue'
const props = defineProps<{ problems: Problem[]; label: string; revealLabel: string; interactive?: boolean; hideId?: boolean; hideTitle?: boolean; reviewSteps?: { id: string; title: string }[] }>()
defineEmits<{ navigate: [step: string] }>()
const index = ref(0)
const current = computed(() => props.problems[index.value])
const heading = ref<HTMLElement | null>(null)
watch(() => props.problems.map(item => item.id).join('|'), () => { index.value = 0 })
async function select(value: number) { index.value = value; await nextTick(); heading.value?.focus({ preventScroll: true }); heading.value?.scrollIntoView({ block: 'start', behavior: 'instant' }) }
</script>
<template>
  <section class="problem-sequence" :aria-label="interactive ? '逐题独立作答' : '逐题例题学习'">
    <div v-if="problems.length > 1" class="question-position"><p ref="heading" tabindex="-1">第 {{ index + 1 }} / {{ problems.length }} 题 · {{ current?.title }}</p><nav aria-label="选择题目"><button v-for="(item, i) in problems" :key="item.id" :aria-label="`第 ${i + 1} 题`" :aria-current="i === index ? 'step' : undefined" @click="select(i)">{{ i + 1 }}</button></nav></div>
    <OriginalProblem v-for="(problem, i) in problems" v-show="index === i" :key="problem.id" :problem="problem" :label="label" :reveal-label="revealLabel" :hide-id="hideId" :hide-title="hideTitle" :interactive="interactive" :active="index === i" :review-steps="reviewSteps" @navigate="$emit('navigate', $event)"><template #solution-media><slot name="solution-media" :problem="problem"/></template></OriginalProblem>
    <div v-if="problems.length > 1" class="question-pagination"><button :disabled="index === 0" @click="select(index - 1)">上一题</button><span class="help">只切换题目，不判定掌握</span><button :disabled="index === problems.length - 1" @click="select(index + 1)">下一题</button></div>
  </section>
</template>
