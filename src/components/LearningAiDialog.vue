<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SubjectWeek } from '../curriculum/types'
import { learningContexts } from '../ai/context'
import { AI_KEY_STORAGE, AiRequestError, askDeepSeek, DEEPSEEK_MODEL, MAX_QUESTION_LENGTH, SYSTEM_PROMPT, validApiKey } from '../ai/deepseek'

import { conversationStore, planHistory, userMessageContent, MAX_HISTORY_TURNS, MAX_REQUEST_CHARACTERS, MAX_ESTIMATED_INPUT_TOKENS } from '../ai/conversation'

const props = defineProps<{ lesson?: SubjectWeek; step: string; week: number; subject: string; subjectLabel: string; stepTitle: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null), questionField = ref<HTMLTextAreaElement | null>(null)
const apiKey = ref(''), consent = ref(false), saved = ref(false), storageMessage = ref('')
const keySettings = ref<HTMLDetailsElement | null>(null)
const question = ref(''), selection = ref(''), includeHistory = ref(true)
const error = ref(''), pending = ref(false)
const session = conversationStore.get(props.week, props.subject)
const lastTurn = computed(() => session.turns.at(-1))
const contexts = computed(() => learningContexts(props.lesson, props.step, props.week, props.subjectLabel))
const selected = computed(() => contexts.value.find(context => context.id === selection.value))
const preview = computed(() => planHistory(session.turns, SYSTEM_PROMPT, userMessageContent(question.value, selected.value?.text || ''), includeHistory.value))
watch(apiKey, value => { if (validApiKey(value)) conversationStore.redactKey(value) }, { flush: 'sync' })
let active: AbortController | null = null
let alive = true

onMounted(async () => {
  try { const stored = localStorage.getItem(AI_KEY_STORAGE); if (stored && validApiKey(stored)) { apiKey.value = stored; saved.value = true } }
  catch { storageMessage.value = '浏览器无法读取本地存储。仍可仅在这次打开时使用 Key。' }
  if (keySettings.value) keySettings.value.open = !saved.value
  dialog.value?.showModal()
  await nextTick(); questionField.value?.focus()
})
onBeforeUnmount(() => { alive = false; active?.abort(); apiKey.value = ''; dialog.value?.close() })
function saveKey() {
  if (!consent.value || !validApiKey(apiKey.value)) { storageMessage.value = '请填写有效 Key，并勾选本地保存同意。'; return }
  try { localStorage.setItem(AI_KEY_STORAGE, apiKey.value); saved.value = true; storageMessage.value = '已保存到当前浏览器。保存不会连接 DeepSeek。'; consent.value = false }
  catch { storageMessage.value = '保存失败，Key 仅在这次打开时可用。浏览器可能禁止存储或空间不足。' }
}
function clearKey() {
  if (pending.value) error.value = '已取消本地等待。已发送的请求可能仍被 DeepSeek 处理和计费。'
  cancelRequest(); apiKey.value = ''; consent.value = false
  try { localStorage.removeItem(AI_KEY_STORAGE); saved.value = false; storageMessage.value = '已清除此浏览器保存的 Key 和当前输入。' }
  catch { storageMessage.value = '当前输入已清空，但本地删除失败。请在浏览器设置中清除此站点的存储。' }
}
function cancelRequest() { const request = active; active = null; request?.abort(); pending.value = false }
function cancel() { cancelRequest(); error.value = '已取消本地等待。已发送的请求可能仍被 DeepSeek 处理和计费。' }
function clearConversation() { cancelRequest(); conversationStore.clear(session); error.value = ''; question.value = ''; selection.value = ''; includeHistory.value = true }
function close() { cancelRequest(); dialog.value?.close(); emit('close') }
async function send() {
  if (pending.value) return
  error.value = ''
  if (!validApiKey(apiKey.value)) { error.value = '请先在「Key 与隐私」中填写 DeepSeek API Key。'; if (keySettings.value) keySettings.value.open = true; return }
  conversationStore.redactKey(apiKey.value)
  // Snapshot exactly the preview, route and revision; later results cannot enter a different session.
  const snapshot = { question: question.value.trim(), context: selected.value?.text || '', contextLabel: selected.value?.label || '未附带新资料', stepTitle: props.stepTitle, history: preview.value.turns.map(turn => ({ ...turn })), revision: session.revision, key: apiKey.value }
  pending.value = true; active = new AbortController()
  const controller = active
  try {
    const result = await askDeepSeek(snapshot.key, snapshot.question, snapshot.context, controller.signal, snapshot.history)
    if (!alive || active !== controller || controller.signal.aborted || session.revision !== snapshot.revision) return
    if (conversationStore.append(session, snapshot.revision, { question: snapshot.question, userContent: userMessageContent(snapshot.question, snapshot.context), answer: result.answer, contextLabel: snapshot.contextLabel, stepTitle: snapshot.stepTitle, truncated: result.truncated }, snapshot.key)) question.value = ''
  } catch (failure) {
    if (alive && active === controller) error.value = failure instanceof AiRequestError ? failure.message : '本次请求未完成，请手动重试。'
  } finally { if (active === controller) { pending.value = false; active = null } }
}
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="learning-ai-dialog" aria-labelledby="learning-ai-title" aria-describedby="learning-ai-description" @cancel.prevent="close">
      <header class="ai-header">
        <div><p class="ai-eyebrow">按需学习助手 · {{ DEEPSEEK_MODEL }}</p><h2 id="learning-ai-title">AI 问答</h2></div>
        <button type="button" class="ai-close" aria-label="关闭 AI 问答" @click="close">关闭</button>
      </header>
      <p id="learning-ai-description" class="ai-note ai-disclosure">同课连续追问。只有点击「发送给 DeepSeek」才会发送本次问题、已选资料、下方预览中的历史问答和辅导提示，并按其规则计费。</p>

      <section class="ai-session-bar" aria-label="当前问答会话">
        <div><strong>第 {{ week }} 周 · {{ subjectLabel }}</strong><p class="ai-note">{{ stepTitle }} · 本课 {{ session.turns.length }} 轮成功问答</p></div>
        <button type="button" :disabled="!session.turns.length && !pending" @click="clearConversation">清空当前会话</button>
      </section>

      <div class="ai-workspace">
        <section class="ai-question-panel" aria-label="提出本次问题">
          <p class="ai-eyebrow">{{ session.turns.length ? '继续追问' : '从卡住的一步开始' }}</p>
          <label class="ai-field ai-question-field">你的问题<textarea ref="questionField" v-model="question" form="learning-ai-form" rows="4" :maxlength="MAX_QUESTION_LENGTH" :disabled="pending" placeholder="例如：这一步为什么要分类讨论？请先给我一点提示。" required /></label>
          <p class="ai-note ai-question-count">{{ question.length }} / {{ MAX_QUESTION_LENGTH }} 字</p>
        </section>

        <details ref="keySettings" class="ai-settings">
          <summary>Key 与隐私 · {{ saved ? '此浏览器已保存' : '尚未本地保存' }}</summary>
          <div class="ai-settings-content">
            <label class="ai-field">DeepSeek API Key<input v-model="apiKey" type="password" name="deepseek-key" autocomplete="off" spellcheck="false" autocapitalize="off" maxlength="512" :disabled="pending" aria-describedby="ai-key-warning" /></label>
            <p id="ai-key-warning" class="ai-note ai-key-warning">不保存也能在这次打开时使用。localStorage 是明文存储，同源脚本（含同一 GitHub Pages 域名下的其他站点）、浏览器扩展或能使用此设备的人可能读取。请只在可信个人设备保存；不要在问题中粘贴 Key 或个人敏感信息。</p>
            <label class="ai-consent"><input v-model="consent" type="checkbox" :disabled="pending"/><span>我了解风险，同意将 Key 保存到当前浏览器</span></label>
            <div class="ai-actions"><button type="button" :disabled="pending || !consent || !validApiKey(apiKey)" @click="saveKey">保存 Key</button><button type="button" @click="clearKey">清除 Key</button></div>
            <p v-if="storageMessage" class="ai-note ai-storage-message" role="status">{{ storageMessage }}</p>
            <p class="ai-note">Key 仅用于官方 API 的认证请求头；不进入学习备份。问答只存当前页面内存，不进入浏览器存储或备份。同一周同一科关闭重开、切小节可继续；换课隔离，回来仍可查看，刷新或关闭页面后清空。不会自动发送学习进度、成绩、日志或整课。</p>
            <p class="ai-note ai-resource-links"><a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer">DeepSeek 官方 Key 管理 ↗</a><a href="https://api-docs.deepseek.com/quick_start/pricing/" target="_blank" rel="noopener noreferrer">模型与计费说明 ↗</a></p>
          </div>
        </details>

        <form id="learning-ai-form" class="ai-composer" @submit.prevent="send">
          <div class="ai-materials">
            <label class="ai-field">附带的学习资料（可选）<select v-model="selection" :disabled="pending"><option value="">不附带新资料</option><option v-for="context in contexts" :key="context.id" :value="context.id">{{ context.label }}</option></select></label>
            <div v-if="selected" class="ai-context-preview"><div class="ai-preview-heading"><strong>将发送以下资料</strong><button type="button" :disabled="pending" @click="selection = ''">取消附带</button></div><pre>{{ selected.text }}</pre><p class="ai-note">不附带题目答案、解析或评分点；图片本身不会发送。</p></div>
            <p v-else class="ai-note">{{ contexts.length ? '可以选择当前知识点或一道题，发送前会显示完整预览。' : '当前页面没有可附带的知识点或题目，可以直接提问。' }}</p>
          </div>
          <section class="ai-history-preview" aria-label="本次发送预览">
            <h3>发送前确认</h3>
            <label class="ai-consent"><input v-model="includeHistory" type="checkbox" :disabled="pending"/><span>附带本课最近的完整问答</span></label>
            <p class="ai-note ai-send-summary">将发送 {{ preview.turns.length }} 轮历史（{{ preview.turns.length * 2 }} 条消息）{{ preview.turns.length ? `：第 ${preview.turns.map(turn => turn.id).join('、')} 轮` : '' }}，加本次问题、{{ selected ? '上方已选资料' : '无新资料' }}和 1 条辅导提示。</p>
            <p v-if="preview.omitted" class="ai-note ai-omitted-history">{{ preview.omitted }} 轮历史本次未附带{{ includeHistory ? '（最近完整轮次或预算限制）' : '（你已关闭历史）' }}；仍可在本课问答中查看。不会自动调用 AI 摘要。</p>
            <details class="ai-request-details"><summary>逐条查看本次完整发送内容</summary><article v-for="(message, index) in preview.messages" :key="index"><strong>{{ index === 0 ? '固定辅导提示' : index === preview.messages.length - 1 ? '本次问题与新资料' : `历史第 ${preview.turns[Math.floor((index - 1) / 2)]?.id} 轮 · ${message.role === 'user' ? '当时问题及资料' : '回答'}` }}</strong><pre>{{ message.content || '（尚未输入问题）' }}</pre></article></details>
            <p class="ai-note ai-budget-note">输入约 {{ preview.characters }} 字符 / 估算 {{ preview.estimatedTokens }} token（粗略估算，非计费依据）。最多附 {{ MAX_HISTORY_TURNS }} 轮，输入预算 {{ MAX_REQUEST_CHARACTERS }} 字符 / 估算 {{ MAX_ESTIMATED_INPUT_TOKENS }} token；始终保留本次问题和新资料，按完整问答对从旧到新舍弃。</p>
          </section>
          <div class="ai-send-row"><span class="ai-note">发送后由 DeepSeek 按其规则计费</span><button v-if="pending" type="button" @click="cancel">取消请求</button><button type="submit" class="primary" :disabled="pending || !question.trim()">{{ pending ? '正在等待回答…' : '发送给 DeepSeek' }}</button></div>
          <p v-if="pending" class="ai-note ai-pending" role="status">正在等待 DeepSeek。关闭窗口、切换小节或取消会停止本地等待；已发请求仍可能计费。</p>
          <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
        </form>
      </div>

      <section class="ai-conversation-section" aria-labelledby="ai-conversation-title">
        <div class="ai-history-heading"><h3 id="ai-conversation-title">本课问答</h3><span class="ai-note">{{ session.turns.length }} 轮已完成</span></div>
        <p class="ai-note">对话只留在当前页面内存，同课关闭重开或换小节可继续，刷新或关闭页面清空。每课最多保留最近 40 轮、12 万字符；不同周或科目互不混用。</p>
        <p v-if="session.evicted" class="ai-note">为控制内存，最早 {{ session.evicted }} 轮已移除。每课最多保留最近 40 轮、约 12 万字符；刷新全部清空。</p>
        <section v-if="session.turns.length" class="ai-conversation-history" aria-label="本课已完成问答" aria-live="polite"><details v-for="turn in session.turns" :key="turn.id" class="ai-turn" :class="{ 'ai-answer': turn.id === lastTurn?.id }" :open="turn.id === lastTurn?.id"><summary>第 {{ turn.id }} 轮 · {{ turn.question.slice(0, 48) }}{{ turn.question.length > 48 ? '…' : '' }}</summary><div class="ai-turn-content"><p class="ai-note">{{ turn.stepTitle }} · 资料：{{ turn.contextLabel }}</p><p class="ai-sent-question">{{ turn.question }}</p><pre>{{ turn.answer }}</pre><p v-if="turn.truncated" class="ai-note">此回答达到输出长度上限，可能不完整。</p></div></details></section>
        <p v-else class="ai-note ai-history-empty">发送第一个问题后，回答会显示在这里。</p>
      </section>
      <p class="ai-note ai-footer">AI 可能出错，请与课内解析核对。回答不会自动评分、改打卡或推进学习周。发送范围以本次预览为准；需要重新开始时可清空当前会话。</p>
    </dialog>
  </Teleport>
</template>

<style>
.learning-ai-dialog {
  width:min(880px,calc(100% - 40px));
  max-height:90vh;
  max-height:90dvh;
  margin:auto;
  padding:30px;
  border:1px solid var(--border);
  border-radius:12px;
  background:var(--bg);
  color:var(--text);
  box-shadow:0 24px 100px #0005;
  overflow:auto;
  overscroll-behavior:contain
}

.learning-ai-dialog::backdrop {
  background:#0009
}

.learning-ai-dialog p {
  margin:12px 0
}

.learning-ai-dialog .ai-header {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:20px;
  margin-bottom:20px
}

.learning-ai-dialog h2 {
  font-size:24px;
  line-height:1.2;
  font-weight:600;
  letter-spacing:0
}

.learning-ai-dialog h3 {
  font-size:18px;
  line-height:1.5;
  font-weight:600;
  letter-spacing:0
}

.learning-ai-dialog .ai-eyebrow {
  margin:0 0 8px;
  font-size:13px;
  line-height:1.5;
  font-weight:600;
  letter-spacing:0
}

.learning-ai-dialog .ai-note {
  color:var(--muted);
  font-size:13px;
  line-height:1.8;
  overflow-wrap:anywhere
}

.learning-ai-dialog a {
  text-decoration:underline;
  text-underline-offset:3px
}

.learning-ai-dialog button {
  font-size:14px;
  font-weight:500
}

.learning-ai-dialog .ai-close {
  flex-shrink:0;
  min-width:72px;
  background:transparent
}

.learning-ai-dialog .ai-disclosure {
  margin:0 0 22px;
  padding:14px 16px;
  border-left:3px solid var(--ink);
  background:var(--soft);
  color:var(--text);
  border-radius:0 8px 8px 0
}

.learning-ai-dialog .ai-session-bar {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  margin-bottom:18px
}

.learning-ai-dialog .ai-session-bar strong {
  font-size:17px;
  font-weight:600
}

.learning-ai-dialog .ai-session-bar .ai-note {
  margin:4px 0 0
}

.learning-ai-dialog .ai-session-bar button {
  flex-shrink:0;
  background:transparent;
  font-size:13px;
  color:var(--muted)
}

.learning-ai-dialog .ai-question-panel {
  grid-area:question;
  min-width:0;
  padding:22px 24px 14px;
  border:1px solid var(--ink);
  border-radius:12px;
  background:var(--surface);
  margin:0
}

.learning-ai-dialog .ai-question-panel .ai-eyebrow {
  color:var(--muted)
}

.learning-ai-dialog .ai-field {
  display:grid;
  gap:10px;
  margin:0;
  font-size:15px;
  line-height:1.6;
  font-weight:600
}

.learning-ai-dialog .ai-field input,.learning-ai-dialog .ai-field select,.learning-ai-dialog .ai-field textarea {
  font:inherit;
  font-size:16px;
  font-weight:400;
  min-width:0;
  width:100%
}

.learning-ai-dialog .ai-question-field {
  font-size:21px;
  font-weight:600;
  gap:14px
}

.learning-ai-dialog .ai-field textarea {
  resize:vertical;
  min-height:128px;
  max-height:360px;
  padding:14px 16px;
  line-height:1.8;
  color:var(--text);
  background:var(--bg);
  border:1px solid var(--control-border,var(--border));
  border-radius:8px
}

.learning-ai-dialog .ai-field input,.learning-ai-dialog .ai-field select {
  border-color:var(--control-border,var(--border))
}

.learning-ai-dialog .ai-field textarea::placeholder {
  color:var(--muted);
  opacity:1
}

.learning-ai-dialog .ai-field textarea:focus-visible {
  outline:2px solid var(--text);
  outline-offset:3px
}

.learning-ai-dialog .ai-question-count {
  text-align:right;
  font-variant-numeric:tabular-nums;
  margin:9px 0 0
}

.learning-ai-dialog .ai-workspace {
  display:grid;
  grid-template-columns:minmax(0,1fr) 270px;
  grid-template-areas:"question settings" "composer settings";
  align-items:start;
  gap:22px 24px
}

.learning-ai-dialog .ai-composer {
  grid-area:composer;
  min-width:0
}

.learning-ai-dialog .ai-settings {
  grid-area:settings;
  min-width:0;
  border:1px solid var(--border);
  border-radius:10px;
  background:var(--surface);
  overflow:hidden
}

.learning-ai-dialog details>summary {
  font-size:14px;
  line-height:1.65;
  min-height:48px;
  overflow-wrap:anywhere
}

.learning-ai-dialog .ai-settings>summary {
  padding:15px 16px;
  font-size:13px;
  background:var(--soft)
}

.learning-ai-dialog .ai-settings>summary:focus-visible {
  outline-offset: -3px;
}
.learning-ai-dialog .ai-settings[open]>summary {
  border-bottom:1px solid var(--border)
}

.learning-ai-dialog .ai-settings-content {
  padding:18px 16px
}

.learning-ai-dialog .ai-settings-content .ai-field {
  font-size:14px
}

.learning-ai-dialog .ai-key-warning {
  color:var(--text)
}

.learning-ai-dialog .ai-consent {
  display:flex;
  gap:10px;
  align-items:flex-start;
  font-size:14px;
  line-height:1.75;
  margin:16px 0
}

.learning-ai-dialog .ai-settings .ai-consent {
  font-size:13px
}

.learning-ai-dialog .ai-actions,.learning-ai-dialog .ai-send-row {
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:10px
}

.learning-ai-dialog .ai-actions button {
  flex:1;
  min-width:0;
  font-size:13px
}

.learning-ai-dialog .ai-storage-message {
  padding:10px 12px;
  background:var(--soft);
  border-radius:6px;
  color:var(--text)
}

.learning-ai-dialog .ai-resource-links {
  display:grid;
  gap:8px;
  margin-bottom:0
}

.learning-ai-dialog .ai-materials {
  padding:2px 0 6px
}

.learning-ai-dialog .ai-context-preview {
  border:1px solid var(--border);
  padding:16px;
  border-radius:8px;
  margin-top:14px;
  background:var(--surface)
}

.learning-ai-dialog .ai-preview-heading {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  font-size:14px
}

.learning-ai-dialog .ai-preview-heading button {
  flex-shrink:0;
  font-size:13px
}

.learning-ai-dialog pre {
  font-family:inherit;
  white-space:pre-wrap;
  overflow-wrap:anywhere;
  line-height:1.9;
  margin:14px 0;
  color:var(--text)
}

.learning-ai-dialog .ai-context-preview pre {
  max-height:240px;
  overflow:auto;
  font-size:14px;
  scrollbar-width:thin
}

.learning-ai-dialog .ai-history-preview {
  border:1px solid var(--border);
  padding:20px;
  border-radius:10px;
  margin:12px 0 0;
  background:var(--surface)
}

.learning-ai-dialog .ai-history-preview h3 {
  margin:0 0 2px
}

.learning-ai-dialog .ai-send-summary {
  padding:12px 14px;
  background:var(--soft);
  border-radius:7px;
  color:var(--text);
  font-size:14px
}

.learning-ai-dialog .ai-request-details {
  border-block:1px solid var(--border);
  margin:16px 0 12px
}

.learning-ai-dialog .ai-request-details>summary {
  padding:13px 0;
  font-size:13px
}

.learning-ai-dialog .ai-request-details article {
  padding:14px 0;
  border-top:1px solid var(--border);
  font-size:13px
}

.learning-ai-dialog .ai-request-details article>strong {
  display:block;
  font-size:14px
}

.learning-ai-dialog .ai-request-details pre {
  max-height:240px;
  overflow:auto;
  font-size:13px;
  scrollbar-width:thin
}

.learning-ai-dialog .ai-budget-note {
  margin-bottom:0
}

.learning-ai-dialog .ai-send-row {
  justify-content:flex-end;
  margin:18px 0 0
}

.learning-ai-dialog .ai-send-row>span {
  flex-basis:100%;
  margin:0;
  text-align:right;
  font-size:13px
}

.learning-ai-dialog .ai-send-row .primary {
  min-height:48px;
  min-width:194px;
  font-size:15px;
  font-weight:600;
  padding:12px 24px
}

.learning-ai-dialog .ai-pending {
  padding:12px 14px;
  background:var(--soft);
  border-radius:7px;
  color:var(--text)
}

.learning-ai-dialog .ai-error {
  border-left:3px solid var(--text);
  padding:12px 14px;
  background:var(--soft);
  color:var(--text);
  font-size:14px;
  line-height:1.8;
  overflow-wrap:anywhere
}

.learning-ai-dialog .ai-conversation-section {
  margin-top:28px;
  padding-top:24px;
  border-top:1px solid var(--border)
}

.learning-ai-dialog .ai-history-heading {
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  gap:12px
}

.learning-ai-dialog .ai-conversation-history {
  display:grid;
  gap:12px;
  margin:18px 0 0
}

.learning-ai-dialog .ai-turn {
  min-width:0;
  border:1px solid var(--border);
  border-radius:10px;
  padding:0 18px;
  background:var(--surface)
}

.learning-ai-dialog .ai-turn>summary {
  padding:15px 0;
  font-size:15px;
  font-weight:600
}

.learning-ai-dialog .ai-turn-content {
  padding:0 0 8px;
  border-top:1px solid var(--border)
}

.learning-ai-dialog .ai-answer {
  border-color:var(--ink)
}

.learning-ai-dialog .ai-turn pre {
  font-size:16px
}

.learning-ai-dialog .ai-sent-question {
  font-size:14px;
  line-height:1.8;
  white-space:pre-wrap;
  overflow-wrap:anywhere;
  border-left:2px solid var(--border);
  padding:8px 12px;
  background:var(--soft);
  color:var(--text)
}

.learning-ai-dialog .ai-history-empty {
  padding:18px;
  text-align:center;
  border:1px dashed var(--border);
  border-radius:8px
}

.learning-ai-dialog .ai-footer {
  border-top:1px solid var(--border);
  padding-top:16px;
  margin:24px 0 0;
  font-size:13px
}

@media(max-width:780px) {
  .learning-ai-dialog {
  width:calc(100% - 28px);
  padding:24px
}
.learning-ai-dialog .ai-workspace {
  grid-template-columns:minmax(0,1fr);
  grid-template-areas:"question" "settings" "composer";
  gap:22px
}
.learning-ai-dialog .ai-settings-content {
  padding:18px
}
.learning-ai-dialog .ai-settings .ai-actions {
  justify-content:flex-start
}
.learning-ai-dialog .ai-settings .ai-actions button {
  flex:0 1 auto;
  min-width:110px
}
.learning-ai-dialog .ai-settings>summary {
  font-size:14px
}
.learning-ai-dialog .ai-send-row .primary {
  min-width:220px
}

}

@media(max-width:480px) {
  .learning-ai-dialog {
  padding:20px 16px;
  width:calc(100% - 16px);
  max-height:94vh;
  max-height:94dvh;
  border-radius:13px
}
.learning-ai-dialog h2 {
  font-size:28px
}
.learning-ai-dialog .ai-header {
  gap:12px;
  margin-bottom:16px
}
.learning-ai-dialog .ai-eyebrow {
  font-size:13px
}
.learning-ai-dialog .ai-disclosure {
  padding:12px 13px;
  margin-bottom:18px
}
.learning-ai-dialog .ai-session-bar {
  align-items:flex-start;
  gap:10px
}
.learning-ai-dialog .ai-session-bar strong {
  font-size:16px
}
.learning-ai-dialog .ai-session-bar button {
  font-size:13px;
  max-width:100px;
  padding:10px
}
.learning-ai-dialog .ai-question-panel {
  padding:18px 16px 12px
}
.learning-ai-dialog .ai-question-field {
  font-size:20px
}
.learning-ai-dialog .ai-field textarea {
  padding:12px;
  min-height:146px
}
.learning-ai-dialog .ai-history-preview {
  padding:16px
}
.learning-ai-dialog .ai-send-row>span {
  text-align:left
}
.learning-ai-dialog .ai-send-row .primary {
  flex:1;
  min-width:0
}
.learning-ai-dialog .ai-context-preview {
  padding:13px
}
.learning-ai-dialog .ai-turn {
  padding:0 14px
}
.learning-ai-dialog .ai-turn pre {
  font-size:16px
}
.learning-ai-dialog .ai-settings-content {
  padding:16px
}

}

@media print {
  .learning-ai-dialog {
  display:none
}

}

</style>
