import { reactive } from 'vue'
import type { InjectionKey } from 'vue'
import type { PodcastLesson } from './catalog'

export const PODCAST_STORAGE_KEY = 'xunxu.podcast.v1'
export const playbackRates = [0.75, 1, 1.25, 1.5, 2]
export interface ListeningRecord { position: number; rate: number; listened: boolean }
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>
export function cleanRecord(value: unknown): ListeningRecord {
  const v = value && typeof value === 'object' ? value as Partial<ListeningRecord> : {}
  return { position: typeof v.position === 'number' && Number.isFinite(v.position) && v.position >= 0 ? v.position : 0,
    rate: playbackRates.includes(v.rate!) ? v.rate! : 1, listened: v.listened === true }
}
export function createPodcastPlayer(storage?: StorageAccess) {
  const state = reactive({ lesson: null as PodcastLesson | null, position: 0, duration: 0, rate: 1,
    playing: false, loading: false, ready: false, listened: false, error: '',
    storageWarning: storage ? '' : '当前浏览器未提供本地存储；收听断点不会保存。' })
  const records: Record<string, ListeningRecord> = Object.create(null)
  try {
    const raw = JSON.parse(storage?.getItem(PODCAST_STORAGE_KEY) || '{}')
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw).slice(0, 500)) records[key] = cleanRecord(value)
    }
  } catch { state.storageWarning = '无法读取收听记录，本次仍可播放。' }
  let audio: HTMLAudioElement | null = null
  let intent = 0
  let pendingPosition = 0
  function record(id: string) { return records[id] || cleanRecord(null) }
  function save() {
    if (!state.lesson) return
    records[state.lesson.id] = { position: state.position, rate: state.rate, listened: state.listened }
    try { storage?.setItem(PODCAST_STORAGE_KEY, JSON.stringify(records)) }
    catch { state.storageWarning = '收听断点未能保存；本次仍可播放。' }
  }
  function seek(value: number) {
    if (!state.lesson || !Number.isFinite(value)) return
    state.position = Math.max(0, Math.min(value, state.duration))
    pendingPosition = state.position
    if (audio && state.ready) audio.currentTime = state.position
    save()
  }
  function rate(value: number) {
    if (!playbackRates.includes(value)) return
    state.rate = value
    if (audio) audio.playbackRate = value
    save()
  }
  async function play() {
    if (!audio || !state.lesson) return
    const ticket = ++intent
    state.error = ''; state.loading = true
    try {
      await audio.play()
      if (ticket !== intent) return
      state.playing = !audio.paused; state.loading = false
    } catch {
      if (ticket !== intent) return
      state.playing = false; state.loading = false
      state.error = '音频未能播放，请检查网络后重试。图文和练习仍可使用。'
    }
  }
  function pause() { ++intent; audio?.pause(); state.playing = false; state.loading = false; save() }
  function select(lesson: PodcastLesson) {
    if (!audio) return
    pause()
    const saved = record(lesson.id)
    state.lesson = lesson; state.position = Math.min(saved.position, lesson.duration)
    pendingPosition = state.position; state.duration = lesson.duration
    state.rate = saved.rate; state.listened = saved.listened
    state.ready = false; state.error = ''; state.loading = true
    audio.src = lesson.src; audio.playbackRate = state.rate; audio.load()
  }
  async function start(lesson: PodcastLesson, fromBeginning = false) {
    if (!audio) return
    if (state.lesson?.id !== lesson.id || state.error) select(lesson)
    if (fromBeginning || state.position >= state.duration) seek(0)
    await play()
  }
  function toggle(lesson: PodcastLesson) {
    if (state.lesson?.id === lesson.id && (state.playing || state.loading) && !state.error) pause()
    else void start(lesson)
  }
  const handlers = {
    loadedmetadata() {
      if (!audio) return
      if (Number.isFinite(audio.duration) && audio.duration > 0) state.duration = audio.duration
      state.ready = true; state.position = Math.min(pendingPosition, state.duration)
      audio.currentTime = state.position; audio.playbackRate = state.rate
    },
    timeupdate() { if (audio && state.ready) { state.position = Math.max(0, Math.min(audio.currentTime, state.duration)); pendingPosition = state.position; save() } },
    play() { state.playing = true; state.error = '' },
    playing() { state.loading = false; state.playing = true },
    pause() { state.playing = false; state.loading = false; save() },
    waiting() { if (state.playing) state.loading = true },
    ended() { ++intent; state.position = state.duration; state.listened = true; state.playing = false; state.loading = false; save() },
    error() { ++intent; state.playing = false; state.loading = false; state.ready = false; state.error = '音频加载失败，请检查网络后重试。图文和练习仍可使用。'; save() },
  }
  function bind(element: HTMLAudioElement) {
    audio = element
    for (const [event, handler] of Object.entries(handlers)) audio.addEventListener(event, handler)
  }
  function dispose() {
    pause()
    if (audio) for (const [event, handler] of Object.entries(handlers)) audio.removeEventListener(event, handler)
    audio = null
  }
  return { state, record, bind, dispose, start, toggle, pause, seek, rate }
}
export type PodcastPlayer = ReturnType<typeof createPodcastPlayer>
export const podcastPlayerKey: InjectionKey<PodcastPlayer> = Symbol('podcast-player')
export const formatAudioTime = (seconds: number) => {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
