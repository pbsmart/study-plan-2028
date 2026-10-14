<script setup lang="ts">
import type { StaticLessonFigure } from '../curriculum/enriched-types'
defineProps<{ figure: StaticLessonFigure }>()
</script>
<template>
  <figure class="static-lesson-figure" :data-figure-id="figure.id">
    <div class="static-figure-image" tabindex="0" role="region" :aria-label="`${figure.title}，可左右滚动查看`"><img :src="figure.src" :alt="figure.altText" :width="figure.width" :height="figure.height" loading="lazy" decoding="async"/></div>
    <figcaption><p class="static-figure-scroll-hint">图可左右滑动，下方保留等效文字。</p><strong>{{ figure.title }}</strong><p>{{ figure.caption }}</p><a :href="figure.src" target="_blank" rel="noopener noreferrer">查看原图 ↗</a></figcaption>
  </figure>
</template>
