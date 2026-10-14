import { ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { StudyWeek } from '../curriculum/types'

export interface StudyWeekSource { loadStudyWeek: (week: number) => Promise<StudyWeek>; peekStudyWeek: (week: number) => StudyWeek | undefined }
/** A later selection or exit always wins over an earlier network response. */
export function useStudyWeek(active: Ref<boolean>, week: Ref<number>, source: StudyWeekSource) {
  const course = shallowRef<StudyWeek>()
  const loading = ref(false)
  const error = ref('')
  let requestId = 0
  async function retry() {
    const request = ++requestId
    if (!active.value) { loading.value = false; error.value = ''; return }
    const target = week.value
    course.value = source.peekStudyWeek(target)
    loading.value = !course.value
    error.value = ''
    try {
      const loaded = await source.loadStudyWeek(target)
      if (request !== requestId || !active.value) return
      course.value = loaded
    } catch (cause) {
      if (request !== requestId || !active.value) return
      course.value = undefined
      error.value = cause instanceof Error ? cause.message : '课程加载失败，请重试。'
    } finally { if (request === requestId) loading.value = false }
  }
  watch([active, week], retry, { immediate: true })
  return { course, loading, error, retry }
}
