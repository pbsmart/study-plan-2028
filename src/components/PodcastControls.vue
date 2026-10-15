<script setup lang="ts">
import { computed, inject } from 'vue'
import type { PodcastLesson } from '../podcast/catalog'
import { podcastPlayerKey, playbackRates, formatAudioTime } from '../podcast/player'
const props = defineProps<{ lesson: PodcastLesson; mini?: boolean }>()
const player = inject(podcastPlayerKey)
const active = computed(() => player?.state.lesson?.id === props.lesson.id)
const position = computed(() => active.value ? player!.state.position : player?.record(props.lesson.id).position || 0)
const duration = computed(() => active.value ? player!.state.duration : props.lesson.duration)
const rate = computed(() => active.value ? player!.state.rate : player?.record(props.lesson.id).rate || 1)
const listened = computed(() => active.value ? player!.state.listened : player?.record(props.lesson.id).listened)
const busy = computed(() => active.value && player?.state.loading)
const playing = computed(() => active.value && player?.state.playing)
</script>
<template>
  <div v-if="player" class="podcast-controls" :class="{ 'podcast-compact': mini }" aria-label="播客播放控制">
    <p v-if="mini" class="podcast-mini-title"><a :href="`#learn/${lesson.week}/${lesson.subject}/${lesson.homeStep}`">正在收听 · {{ lesson.title }} ↗</a></p>
    <div class="podcast-buttons">
      <button class="primary" @click="player.toggle(lesson)" :aria-label="playing || busy ? '暂停播客' : '播放播客'">{{ playing || busy ? '暂停' : '播放' }}</button>
      <button :disabled="!active || !player.state.ready" aria-label="后退15秒" @click="player.seek(position - 15)">−15秒</button>
      <button :disabled="!active || !player.state.ready" aria-label="前进15秒" @click="player.seek(position + 15)">+15秒</button>
      <label class="podcast-rate">倍速<select aria-label="播放倍速" :value="rate" @change="player.rate(Number(($event.target as HTMLSelectElement).value))" :disabled="!active"><option v-for="speed in playbackRates" :key="speed" :value="speed">{{ speed }}×</option></select></label>
      <button v-if="!mini" @click="player.start(lesson, true)">从头播放</button>
    </div>
    <label class="podcast-seek">播放进度
      <input type="range" min="0" :max="duration" step="0.1" :value="position" :disabled="!active || !player.state.ready" aria-label="播客播放进度" :aria-valuetext="`${formatAudioTime(position)}，共${formatAudioTime(duration)}`" @input="player.seek(Number(($event.target as HTMLInputElement).value))"/>
    </label>
    <p class="help podcast-time"><span>{{ formatAudioTime(position) }} / {{ formatAudioTime(duration) }}{{ busy ? ' · 正在加载…' : '' }}</span><span>{{ listened ? '已听完' : '尚未听完' }} · 不代表已掌握</span></p>
    <div v-if="active && player.state.error" class="podcast-error" role="alert"><p>{{ player.state.error }}</p><button @click="player.start(lesson)">重试音频</button></div>
    <p v-if="player.state.storageWarning" class="help" role="status">{{ player.state.storageWarning }}</p>
  </div>
</template>
