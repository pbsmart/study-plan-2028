<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PodcastPlayer } from '../podcast/player'
import PodcastControls from './PodcastControls.vue'
const props = defineProps<{ player: PodcastPlayer; inline: boolean }>()
const element = ref<HTMLAudioElement | null>(null)
onMounted(() => { if (element.value) props.player.bind(element.value) })
watch(() => !!props.player.state.lesson && !props.inline, mini => { if (typeof document !== 'undefined') document.documentElement.classList?.toggle('has-mini-podcast', mini) }, { immediate: true })
onBeforeUnmount(() => { props.player.dispose(); document.documentElement.classList.remove('has-mini-podcast') })
</script>
<template>
  <audio ref="element" preload="metadata" aria-label="课程音频" />
  <aside v-if="player.state.lesson && !inline" class="podcast-mini" aria-label="迷你播客播放器"><PodcastControls :lesson="player.state.lesson" mini/></aside>
</template>
<style src="../styles/podcast.css"></style>
