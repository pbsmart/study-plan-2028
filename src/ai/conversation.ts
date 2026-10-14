import { reactive } from 'vue'

export const MAX_HISTORY_TURNS = 6
export const MAX_REQUEST_CHARACTERS = 32000
export const MAX_ESTIMATED_INPUT_TOKENS = 20000
export const MAX_MEMORY_TURNS = 40
export const MAX_MEMORY_CHARACTERS = 120000
export interface ConversationTurn {
  id: number; question: string; userContent: string; answer: string
  contextLabel: string; stepTitle: string; truncated: boolean
}
export interface ConversationSession { turns: ConversationTurn[]; revision: number; nextId: number; evicted: number }
export interface ConversationMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface HistoryPlan {
  turns: ConversationTurn[]; omitted: number; characters: number; estimatedTokens: number
  messages: ConversationMessage[]
}
const credentialPattern = /\bsk-[A-Za-z0-9_-]{8,}\b/g
export function containsCredential(text: string, key = '') { return (!!key && text.includes(key)) || /\bsk-[A-Za-z0-9_-]{8,}\b/.test(text) }
export function redactCredentials(text: string, key = '') { return (key ? text.replaceAll(key, '[已隐藏密钥]') : text).replace(credentialPattern, '[已隐藏密钥]') }
export function userMessageContent(question: string, context = '') {
  return context ? `我的问题：\n${question.trim()}\n\n本次明确选择的学习资料：\n${context}` : question.trim()
}
function measure(messages: ConversationMessage[]) {
  return { characters: messages.reduce((sum, message) => sum + message.content.length, 0), estimatedTokens: messages.reduce((sum, message) => sum + Math.ceil(new TextEncoder().encode(message.content).length / 3) + 8, 0) }
}
/** Deterministic contiguous suffix of whole successful pairs; no paid summarization. */
export function planHistory(turns: readonly ConversationTurn[], system: string, current: string, includeHistory = true): HistoryPlan {
  const selected: ConversationTurn[] = []
  const messagesFor = (history: ConversationTurn[]): ConversationMessage[] => [
    { role: 'system', content: system },
    ...history.flatMap(turn => [{ role: 'user' as const, content: turn.userContent }, { role: 'assistant' as const, content: turn.answer }]),
    { role: 'user', content: current },
  ]
  if (includeHistory) for (let index = turns.length - 1; index >= 0 && selected.length < MAX_HISTORY_TURNS; index--) {
    const candidate = [turns[index]!, ...selected]
    const size = measure(messagesFor(candidate))
    if (size.characters > MAX_REQUEST_CHARACTERS || size.estimatedTokens > MAX_ESTIMATED_INPUT_TOKENS) break
    selected.unshift(turns[index]!)
  }
  const messages = messagesFor(selected)
  return { turns: selected, omitted: turns.length - selected.length, ...measure(messages), messages }
}

/** In-memory only. Never attached to the learning data/backup model. */
export function createConversationStore() {
  const sessions = new Map<string, ConversationSession>()
  return {
    get(week: number, subject: string) {
      const id = `${week}:${subject}`
      let session = sessions.get(id)
      if (!session) { session = reactive<ConversationSession>({ turns: [], revision: 0, nextId: 1, evicted: 0 }); sessions.set(id, session) }
      return session
    },
    clear(session: ConversationSession) { session.turns = []; session.revision++; session.nextId = 1; session.evicted = 0 },
    redactKey(key: string) {
      if (!key) return
      for (const session of sessions.values()) for (const turn of session.turns) {
        turn.question = redactCredentials(turn.question, key); turn.userContent = redactCredentials(turn.userContent, key); turn.answer = redactCredentials(turn.answer, key)
      }
    },
    append(session: ConversationSession, revision: number, turn: Omit<ConversationTurn, 'id'>, key: string) {
      if (session.revision !== revision || containsCredential(turn.question, key) || containsCredential(turn.userContent, key)) return false
      session.turns.push({ ...turn, answer: redactCredentials(turn.answer, key), id: session.nextId++ })
      let size = session.turns.reduce((sum, item) => sum + item.userContent.length + item.answer.length, 0)
      while (session.turns.length > MAX_MEMORY_TURNS || (size > MAX_MEMORY_CHARACTERS && session.turns.length > 1)) {
        const oldest = session.turns.shift()!; size -= oldest.userContent.length + oldest.answer.length; session.evicted++
      }
      return true
    },
  }
}
export const conversationStore = createConversationStore()
