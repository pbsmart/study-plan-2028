export interface PodcastLesson {
  id: string; title: string; src: string; duration: number; version: string
  week: number; subject: 'physics'; homeStep: string
}
export const firstPodcast: PodcastLesson = {
  id: 'w1-physics-distance', title: '路程与位移',
  src: `${import.meta.env.BASE_URL}audio/lesson-01-distance-and-displacement.mp3`,
  duration: 398.805, version: '完整课 · Dylan / Serena · 6分38.8秒',
  week: 1, subject: 'physics', homeStep: 'prepare',
}
export function podcastFor(week: number, subject: string) {
  return week === 1 && subject === 'physics' ? firstPodcast : undefined
}
export const inlinePodcastSteps = ['prepare', 'w1-physics-s4', 'w1-physics-s5', 'w1-physics-s6']
export const podcastLinks = [
  { title: '参考系与位置', ids: ['w1-physics-s2', 'w1-physics-s3'], note: '先统一原点、正方向和参考系。' },
  { title: '位移与方向', ids: ['w1-physics-s4', 'w1-physics-ex2', 'w1-physics-pr2', 'w1-physics-pr4'], note: '末位置减初位置，单独报告大小和方向。' },
  { title: '路程与往返图', ids: ['w1-physics-s5', 'w1-physics-ex3', 'w1-physics-pr3', 'w1-physics-pr6'], note: '沿实际路径累计长度；原有图为 −2→6→1，与音频例子不同。' },
  { title: '路径条件与自检', ids: ['w1-physics-s6', 'w1-physics-ex4', 'w1-physics-pr5'], note: '只知道端点不能补出路径；比较路程与位移大小。' },
]
