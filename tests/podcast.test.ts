import { describe, expect, it } from 'vitest'
import { cleanRecord, createPodcastPlayer, formatAudioTime, PODCAST_STORAGE_KEY } from '../src/podcast/player'
import { firstPodcast, podcastFor, podcastLinks } from '../src/podcast/catalog'
import physics from '../src/curriculum/enriched-week-01/physics.json'

class AudioDouble extends EventTarget {
  src = ''; currentTime = 0; duration = 398.805; playbackRate = 1; paused = true; loads = 0
  reject = false
  load() { this.loads++ }
  async play() { if (this.reject) throw new Error('network'); this.paused = false; this.dispatchEvent(new Event('play')); this.dispatchEvent(new Event('playing')) }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
  fire(event: string) { this.dispatchEvent(new Event(event)) }
}
function setup(raw = '{}') {
  let value = raw
  const writes: string[] = []
  const player = createPodcastPlayer({ getItem: () => value, setItem: (key, next) => { expect(key).toBe(PODCAST_STORAGE_KEY); value = next; writes.push(next) } })
  const audio = new AudioDouble()
  player.bind(audio as unknown as HTMLAudioElement)
  return { player, audio, writes, saved: () => JSON.parse(value) }
}
describe('independent podcast playback', () => {
  it('uses a full real first lesson and maps only existing learning activities', () => {
    expect(firstPodcast.duration).toBeCloseTo(398.805)
    expect(firstPodcast.version).toContain('Serena')
    expect(podcastFor(1, 'math')).toBeUndefined(); expect(podcastFor(2, 'physics')).toBeUndefined()
    const ids = [...physics.sections, ...physics.workedExamples, ...physics.practice].map(item => item.id)
    for (const link of podcastLinks) for (const id of link.ids) expect(ids).toContain(id)
  })
  it('restores a lesson only after explicit play, seeks after metadata and saves rate separately', async () => {
    const { player, audio, saved } = setup(JSON.stringify({ [firstPodcast.id]: { position: 94, rate: 1.5, listened: false } }))
    expect(player.state.lesson).toBeNull(); expect(audio.loads).toBe(0)
    await player.start(firstPodcast)
    expect(audio.src).toBe(firstPodcast.src); expect(audio.loads).toBe(1)
    audio.fire('loadedmetadata'); expect(audio.currentTime).toBe(94); expect(audio.playbackRate).toBe(1.5)
    player.seek(109); player.rate(1.25); player.pause()
    expect(saved()[firstPodcast.id]).toEqual({ position: 109, rate: 1.25, listened: false })
    await player.start(firstPodcast); expect(audio.loads).toBe(1)
    await player.start(firstPodcast, true); expect(audio.currentTime).toBe(0)
    expect(player.state.listened).toBe(false)
  })
  it('keeps lesson records independent and clamps malformed positions and rates', async () => {
    expect(cleanRecord({ position: -9, rate: 0, listened: 'yes' })).toEqual({ position: 0, rate: 1, listened: false })
    const { player, audio, saved } = setup()
    await player.start(firstPodcast); audio.fire('loadedmetadata'); player.seek(70); player.rate(2)
    const other = { ...firstPodcast, id: 'other', src: '/other.mp3' }
    await player.start(other); audio.fire('loadedmetadata')
    expect(player.state.position).toBe(0); expect(player.state.rate).toBe(1)
    player.seek(Infinity); expect(player.state.position).toBe(0)
    player.seek(9999); expect(player.state.position).toBe(audio.duration)
    await player.start(firstPodcast); audio.fire('loadedmetadata')
    expect(player.state.position).toBe(70); expect(player.state.rate).toBe(2)
    expect(Object.keys(saved()).sort()).toEqual(['other', firstPodcast.id].sort())
  })
  it('ends without auto-next or mastery writes and persists listened independently', async () => {
    const { player, audio, saved, writes } = setup()
    await player.start(firstPodcast); audio.fire('loadedmetadata'); audio.fire('ended')
    expect(player.state.listened).toBe(true); expect(player.state.playing).toBe(false)
    expect(player.state.lesson?.id).toBe(firstPodcast.id); expect(audio.loads).toBe(1)
    expect(saved()[firstPodcast.id].listened).toBe(true)
    expect(writes.join('')).not.toMatch(/completed|mastery|weeks|sessions/)
    await player.start(firstPodcast); expect(audio.currentTime).toBe(0)
  })
  it('recovers media and play errors with an explicit retry', async () => {
    const { player, audio } = setup()
    audio.reject = true; await player.start(firstPodcast)
    expect(player.state.error).toContain('未能播放'); expect(player.state.loading).toBe(false)
    audio.reject = false; await player.start(firstPodcast); audio.fire('loadedmetadata')
    expect(player.state.error).toBe(''); expect(player.state.playing).toBe(true)
    audio.fire('error'); expect(player.state.error).toContain('加载失败')
    await player.start(firstPodcast); expect(player.state.error).toBe(''); expect(audio.loads).toBe(3)
  })
  it('does not let a late play rejection override a newer pause and handles unavailable storage', async () => {
    const { player, audio } = setup()
    let reject!: (reason: Error) => void
    audio.play = () => new Promise<void>((_, no) => { reject = no })
    const pending = player.start(firstPodcast); player.pause(); reject(new Error('interrupted')); await pending
    expect(player.state.error).toBe(''); expect(player.state.playing).toBe(false)
    const blocked = createPodcastPlayer({ getItem() { throw new Error() }, setItem() { throw new Error() } })
    blocked.bind(new AudioDouble() as unknown as HTMLAudioElement); await blocked.start(firstPodcast); blocked.seek(22)
    expect(blocked.state.storageWarning).toContain('未能保存'); expect(blocked.state.position).toBe(22)
    expect(createPodcastPlayer().state.storageWarning).toContain('不会保存')
    player.dispose(); audio.fire('ended'); expect(player.state.listened).toBe(false)
    expect(formatAudioTime(NaN)).toBe('0:00'); expect(formatAudioTime(398.805)).toBe('6:38')
  })
})
