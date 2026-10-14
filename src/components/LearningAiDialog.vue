<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { SubjectWeek } from '../curriculum/types'
import { learningContexts } from '../ai/context'
import { AI_KEY_STORAGE, AiRequestError, askDeepSeek, DEEPSEEK_MODEL, MAX_QUESTION_LENGTH, validApiKey } from '../ai/deepseek'

const props = defineProps<{ lesson?: SubjectWeek; step: string; week: number; subjectLabel: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null), questionField = ref<HTMLTextAreaElement | null>(null)
const apiKey = ref(''), consent = ref(false), saved = ref(false), storageMessage = ref('')
const keySettings = ref<HTMLDetailsElement | null>(null)
const question = ref(''), selection = ref(''), answer = ref(''), sentQuestion = ref(''), sentContext = ref('')
const error = ref(''), pending = ref(false), truncated = ref(false)
const contexts = computed(() => learningContexts(props.lesson, props.step, props.week, props.subjectLabel))
const selected = computed(() => contexts.value.find(context => context.id === selection.value))
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
  active?.abort(); apiKey.value = ''; consent.value = false
  try { localStorage.removeItem(AI_KEY_STORAGE); saved.value = false; storageMessage.value = '已清除此浏览器保存的 Key 和当前输入。' }
  catch { storageMessage.value = '当前输入已清空，但本地删除失败。请在浏览器设置中清除此站点的存储。' }
}
function close() { active?.abort(); dialog.value?.close(); emit('close') }
async function send() {
  if (pending.value) return
  error.value = ''; answer.value = ''; truncated.value = false
  if (!validApiKey(apiKey.value)) { error.value = '请先在「Key 与隐私」中填写 DeepSeek API Key。'; if (keySettings.value) keySettings.value.open = true; return }
  pending.value = true; active = new AbortController()
  const controller = active
  try {
    const result = await askDeepSeek(apiKey.value, question.value, selected.value?.text || '', controller.signal)
    if (!alive || active !== controller) return
    answer.value = result.answer; truncated.value = result.truncated
    sentQuestion.value = question.value.trim(); sentContext.value = selected.value?.label || '未附带资料'
  } catch (failure) {
    if (alive && active === controller) error.value = failure instanceof AiRequestError ? failure.message : '本次请求未完成，请手动重试。'
  } finally { if (active === controller) { pending.value = false; active = null } }
}
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="learning-ai-dialog" aria-labelledby="learning-ai-title" aria-describedby="learning-ai-description" @cancel.prevent="close">
      <header class="ai-header"><div><p class="ai-eyebrow">按需学习助手 · {{ DEEPSEEK_MODEL }}</p><h2 id="learning-ai-title">AI 问答</h2></div><button type="button" aria-label="关闭 AI 问答" @click="close">关闭</button></header>
      <p id="learning-ai-description" class="ai-note">每次独立提问。只有点击「发送给 DeepSeek」才会把本次问题、已选资料和辅导提示发送给 DeepSeek 官方 API，并按其规则计费。</p>
      <details ref="keySettings" class="ai-settings"><summary>Key 与隐私 · {{ saved ? '此浏览器已保存' : '尚未本地保存' }}</summary>
        <label class="ai-field">DeepSeek API Key<input v-model="apiKey" type="password" name="deepseek-key" autocomplete="off" spellcheck="false" autocapitalize="off" maxlength="512" :disabled="pending" aria-describedby="ai-key-warning" /></label>
        <p id="ai-key-warning" class="ai-note">不保存也能在这次打开时使用。localStorage 是明文存储，同源脚本（含同一 GitHub Pages 域名下的其他站点）、浏览器扩展或能使用此设备的人可能读取。请只在可信个人设备保存；不要在问题中粘贴 Key 或个人敏感信息。</p>
        <label class="ai-consent"><input v-model="consent" type="checkbox" :disabled="pending"/><span>我了解风险，同意将 Key 保存到当前浏览器</span></label>
        <div class="ai-actions"><button type="button" :disabled="pending || !consent || !validApiKey(apiKey)" @click="saveKey">保存 Key</button><button type="button" @click="clearKey">清除 Key</button></div>
        <p v-if="storageMessage" class="ai-note" role="status">{{ storageMessage }}</p>
        <p class="ai-note">Key 仅用于官方 API 的认证请求头；不进入学习备份。问答只在这次打开期间保留，关闭、刷新或换小节后清空。不会自动发送学习进度、成绩、日志、整课或以前的问答。</p>
        <p class="ai-note"><a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer">DeepSeek 官方 Key 管理 ↗</a> · <a href="https://api-docs.deepseek.com/quick_start/pricing/" target="_blank" rel="noopener noreferrer">模型与计费说明 ↗</a></p>
      </details>
      <form @submit.prevent="send">
        <label class="ai-field">附带的学习资料（可选）<select v-model="selection" :disabled="pending"><option value="">不附带资料，只发我的问题</option><option v-for="context in contexts" :key="context.id" :value="context.id">{{ context.label }}</option></select></label>
        <div v-if="selected" class="ai-context-preview"><div class="ai-preview-heading"><strong>将发送以下资料</strong><button type="button" :disabled="pending" @click="selection = ''">取消附带</button></div><pre>{{ selected.text }}</pre><p class="ai-note">不附带题目答案、解析或评分点；图片本身不会发送。</p></div>
        <p v-else class="ai-note">{{ contexts.length ? '可以选择当前知识点或一道题，发送前会显示完整预览。' : '当前页面没有可附带的知识点或题目，可以直接提问。' }}</p>
        <label class="ai-field">你的问题<textarea ref="questionField" v-model="question" rows="4" :maxlength="MAX_QUESTION_LENGTH" :disabled="pending" placeholder="例如：这一步为什么要分类讨论？请先给我一点提示。" required /></label>
        <div class="ai-send-row"><span class="ai-note">{{ question.length }} / {{ MAX_QUESTION_LENGTH }} 字</span><button v-if="pending" type="button" @click="active?.abort()">取消请求</button><button type="submit" class="primary" :disabled="pending || !question.trim()">{{ pending ? '正在等待回答…' : '发送给 DeepSeek' }}</button></div>
      </form>
      <p v-if="pending" class="ai-note" role="status">正在等待 DeepSeek。关闭窗口、切换小节或取消会停止本地等待；已发请求仍可能计费。</p>
      <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
      <section v-if="answer" class="ai-answer" aria-labelledby="ai-answer-title" aria-live="polite"><h3 id="ai-answer-title">这次的回答</h3><p class="ai-note">资料：{{ sentContext }}</p><p class="ai-sent-question">{{ sentQuestion }}</p><pre>{{ answer }}</pre><p v-if="truncated" class="ai-note">回答达到本次长度上限，可能不完整。可缩小问题后再问。</p></section>
      <p class="ai-note ai-footer">AI 可能出错，请与课内解析核对。回答不会自动评分、改打卡或推进学习周。再次发送只使用上面的本次问题和所选资料。</p>
    </dialog>
  </Teleport>
</template>

<style>
.learning-ai-dialog{width:min(640px,calc(100% - 32px));max-height:90vh;max-height:90dvh;margin:auto;padding:26px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);overflow:auto;overscroll-behavior:contain}.learning-ai-dialog::backdrop{background:#0009}.learning-ai-dialog p{margin:12px 0}.learning-ai-dialog .ai-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.learning-ai-dialog h2{font-size:23px}.learning-ai-dialog .ai-eyebrow{font-size:11px;margin:0 0 6px}.learning-ai-dialog .ai-note{font-size:12px;line-height:1.8;overflow-wrap:anywhere}.learning-ai-dialog a{text-decoration:underline;text-underline-offset:3px}.ai-settings{border-block:1px solid var(--border);margin:18px 0;padding:4px 0}.ai-field{display:grid;gap:8px;margin:18px 0 10px;font-size:14px}.ai-field input,.ai-field select,.ai-field textarea{font:inherit;font-size:16px;min-width:0;width:100%}.ai-field textarea{resize:vertical;min-height:110px;max-height:320px;padding:12px;line-height:1.7;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:7px}.ai-field textarea:focus-visible{outline:3px solid var(--text);outline-offset:3px}.ai-consent{display:flex;gap:10px;align-items:flex-start;font-size:12px;line-height:1.8;margin:15px 0}.ai-actions,.ai-send-row{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.ai-send-row{justify-content:flex-end;margin:14px 0}.ai-send-row>span{margin-right:auto}.ai-context-preview{border:1px solid var(--border);padding:14px;border-radius:7px;margin-top:12px}.ai-preview-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px}.ai-context-preview pre{max-height:200px;overflow:auto;font-size:12px}.learning-ai-dialog pre{font-family:inherit;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.9;margin:14px 0;color:var(--text)}.ai-error{border-left:3px solid var(--text);padding:10px 14px;background:var(--soft);font-size:13px}.ai-answer{margin-top:24px;border-top:1px solid var(--border);padding-top:24px}.ai-answer h3{font-size:17px}.ai-answer pre{font-size:15px}.ai-sent-question{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;border-left:2px solid var(--border);padding-left:12px}.ai-footer{border-top:1px solid var(--border);padding-top:16px}@media(max-width:600px){.learning-ai-dialog{padding:20px;width:calc(100% - 20px);max-height:94dvh}.ai-send-row .primary{flex:1}.ai-context-preview{padding:11px}}@media print{.learning-ai-dialog{display:none}}
</style>
