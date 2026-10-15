<script setup lang="ts">
import { computed } from 'vue'
import type { SubjectWeek } from '../curriculum/types'
import { podcastFor, podcastLinks } from '../podcast/catalog'
import { firstTranscript } from '../podcast/transcript'
import PodcastControls from './PodcastControls.vue'
const props = defineProps<{ week: number; subject: string; lesson?: SubjectWeek; overview?: boolean }>()
defineEmits<{ navigate: [step: string] }>()
const podcast = computed(() => podcastFor(props.week, props.subject))
const title = (id: string) => {
  const e = props.lesson?.enrichment
  return [...(e?.sections || []), ...(e?.workedExamples || []), ...(e?.practice || [])].find(item => item.id === id)?.title || id
}
</script>
<template>
  <section v-if="podcast" class="lesson-podcast" aria-label="路程与位移播客">
    <p class="eyebrow">先听一段，再画图、动笔</p>
    <h3>原创播客 · {{ podcast.title }}</h3>
    <p class="help">{{ podcast.version }}。按已确认声线配置制作。</p>
    <PodcastControls :lesson="podcast"/>
    <template v-if="overview">
      <p class="help">仅在本浏览器保存每课断点和倍速。听完不勾选学习打卡，不自动播放下一课。</p>
      <details class="podcast-transcript"><summary>展开逐字稿（含口头练习解答）</summary><p class="help">这是合成脚本，尚未逐字听校；时间标记来自制作记录，不作同步字幕。</p><pre>{{ firstTranscript }}</pre></details>
      <details class="podcast-study-links"><summary>接着学 · 图文与现有例题练习</summary>
        <p>音频主例：从0 m向东6 m，再向西2 m（0→6→4）。原有往返图：−2→6→1。两组数据分别计算，不能混用。</p>
        <article v-for="group in podcastLinks" :key="group.title"><h4>{{ group.title }}</h4><p class="help">{{ group.note }}</p><div class="podcast-links"><button v-for="id in group.ids" :key="id" class="text-button" @click="$emit('navigate', id)">{{ title(id) }} →</button></div></article>
      </details>
      <p class="help"><button class="text-button" @click="$emit('navigate', 'w1-physics-s4')">开始图文 · 位移与路程 →</button></p>
    </template>
  </section>
  <p v-else-if="overview" class="help podcast-pending">本课播客待制作；可先学习现有图文与练习。</p>
</template>
