<script setup lang="ts">
import type { LessonDiagram } from '../curriculum/enriched-types'
const props = defineProps<{ diagram: LessonDiagram }>()
const x = (value: number) => 70 + (value - props.diagram.axis.min) / (props.diagram.axis.max - props.diagram.axis.min || 1) * 580
</script>
<template>
  <figure class="lesson-diagram">
    <svg :viewBox="`0 0 720 ${190 + diagram.route.length * 48}`" role="img" :aria-labelledby="`${diagram.id}-title ${diagram.id}-description`">
      <title :id="`${diagram.id}-title`">{{ diagram.title }}</title><desc :id="`${diagram.id}-description`">{{ diagram.altText }}</desc>
      <defs><marker :id="`${diagram.id}-arrow`" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse"><path d="M0 0 L7 3.5 L0 7 Z" fill="currentColor"/></marker></defs>
      <text x="70" y="24" font-size="16">{{ diagram.axis.positiveDirection }} · 单位 {{ diagram.axis.unit }}</text>
      <line x1="60" x2="660" y1="65" y2="65" stroke="currentColor" :marker-end="`url(#${diagram.id}-arrow)`"/>
      <g v-for="tick in diagram.axis.ticks" :key="tick"><line :x1="x(tick)" :x2="x(tick)" y1="59" y2="71" stroke="currentColor"/><text :x="x(tick)" y="93" text-anchor="middle" font-size="15">{{ tick }}</text></g>
      <g v-for="point in diagram.points" :key="point.label"><circle :cx="x(point.x)" cy="65" r="4" fill="currentColor"/><text :x="x(point.x)" y="48" text-anchor="middle" font-size="15">{{ point.label }}</text></g>
      <g v-for="(segment, i) in diagram.route" :key="i"><line :x1="x(segment.from)" :x2="x(segment.to)" :y1="126 + i * 48" :y2="126 + i * 48" stroke="currentColor" stroke-width="2" :marker-end="`url(#${diagram.id}-arrow)`"/><text :x="(x(segment.from) + x(segment.to)) / 2" :y="117 + i * 48" text-anchor="middle" font-size="14">{{ segment.label }}</text></g>
      <line :x1="x(diagram.displacement.from)" :x2="x(diagram.displacement.to)" :y1="139 + diagram.route.length * 48" :y2="139 + diagram.route.length * 48" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4" :marker-end="`url(#${diagram.id}-arrow)`"/><text :x="(x(diagram.displacement.from) + x(diagram.displacement.to)) / 2" :y="130 + diagram.route.length * 48" text-anchor="middle" font-size="14">{{ diagram.displacement.label }}</text>
    </svg><figcaption>{{ diagram.description }}</figcaption>
  </figure>
</template>
