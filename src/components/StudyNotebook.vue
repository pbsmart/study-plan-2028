<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { notebookKey } from '../notebook'
import type { SubjectId } from '../model'
import { names } from '../model'
const props = defineProps<{ week?: number; subject?: SubjectId; step?: string; title?: string }>()
const notebook = inject(notebookKey, null)
const draft = ref(''), needsReview = ref(false), filter = ref('all'), input = ref<HTMLInputElement | null>(null)
const route = computed(() => props.week && props.subject && props.step ? `${props.week}/${props.subject}/${props.step}` : '')
const saved = computed(() => notebook?.state.notes.find(item => item.id === route.value))
const notes = computed(() => notebook?.state.notes.filter(note => filter.value !== 'review' || note.needsReview) || [])
onMounted(() => { notebook?.load(); draft.value = saved.value?.text || ''; needsReview.value = saved.value?.needsReview || false })
function remove(id: string) { if (confirm('删除这条笔记？')) notebook?.remove(id) }
function save() {
  if (!props.week || !props.subject || !props.step || !draft.value.trim()) return
  notebook?.save({ id: route.value, week: props.week, subject: props.subject, step: props.step, title: props.title || props.step, text: draft.value.trim(), needsReview: needsReview.value })
}
function download(raw: string) { if (!raw) return; const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'xunxu-notebook-v1.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
async function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !notebook) return
  try { if (file.size > 5 * 1024 * 1024) throw new Error('笔记文件超过5 MB。'); const raw = await file.text(); if (confirm('合并笔记？同一课程步骤的记录将使用导入版本，其他记录保留。')) notebook.merge(raw) }
  catch (error) { notebook.state.error = (error as Error).message }
  finally { (event.target as HTMLInputElement).value = '' }
}
</script>
<template>
  <section v-if="notebook" class="study-notebook">
    <template v-if="route">
      <details class="note-editor"><summary>笔记与错因</summary><label :for="`note-${route}`">记录自己的理解、卡点或订正<textarea :id="`note-${route}`" v-model="draft" rows="4" maxlength="8000" placeholder="只保存在本浏览器，不会自动发送给 AI。"/></label><label class="check-row"><input v-model="needsReview" type="checkbox"/><span>加入待订正列表（自行标记）</span></label><button :disabled="!draft.trim()" @click="save">保存这一步笔记</button><a class="text-button" href="#notebook">查看全部笔记与错题 →</a></details>
    </template>
    <template v-else>
      <p class="help">按学习周、学科和步骤保存。待订正由你标记，不是自动判分；笔记不会自动发送给 AI。计划备份与笔记备份分开。</p>
      <div class="notebook-toolbar"><label>查看<select v-model="filter" aria-label="笔记筛选"><option value="all">全部笔记</option><option value="review">待订正</option></select></label><button @click="download(notebook.exportText())">导出笔记备份</button><button @click="input?.click()">导入笔记备份</button><input ref="input" class="hidden-input" type="file" accept=".json,application/json" aria-label="选择笔记备份" @change="importFile"/></div>
      <p v-if="!notes.length" class="notebook-empty">{{ filter === 'review' ? '还没有自行标记的待订正记录。' : '还没有笔记。在课程页展开“笔记与错因”即可保存。' }}</p>
      <article v-for="note in notes" :key="note.id" class="notebook-item"><p class="eyebrow">第 {{ note.week }} 周 · {{ names[note.subject] }}{{ note.needsReview ? ' · 待订正' : '' }}</p><h2><a :href="`#learn/${note.week}/${note.subject}/${note.step}`">{{ note.title }} →</a></h2><p class="math-text">{{ note.text }}</p><button v-if="note.needsReview" @click="notebook.save({ ...note, needsReview: false })">标记已订正</button><button @click="remove(note.id)">删除笔记</button></article>
    </template>
    <p v-if="notebook.state.error" role="alert" class="notebook-error">{{ notebook.state.error }}<button @click="download(notebook.exportOriginal())">导出原始笔记</button></p>
    <p v-else-if="notebook.state.notice" role="status" class="help">{{ notebook.state.notice }}</p>
  </section>
</template>
