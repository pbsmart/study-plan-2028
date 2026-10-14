import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useStudyWeek } from '../src/composables/useStudyWeek'
import type { StudyWeek } from '../src/curriculum/types'
const weekData = (week:number):StudyWeek => ({week,title:`第${week}周`,stage:'基础',summary:'课程',subjects:{}})
const deferred = () => { let resolve!: (value:StudyWeek)=>void;let reject!: (reason:Error)=>void;const promise=new Promise<StudyWeek>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject} }
const settle=async()=>{await Promise.resolve();await nextTick();await Promise.resolve()}

describe('asynchronous course view state',()=>{
  it('does not fetch course bodies for the overview or weekly plan',async()=>{
    const scope=effectScope(),load=vi.fn();const active=ref(false),week=ref(1)
    const state=scope.run(()=>useStudyWeek(active,week,{loadStudyWeek:load,peekStudyWeek:()=>undefined}))!
    await settle();expect(load).not.toHaveBeenCalled();expect(state.loading.value).toBe(false);scope.stop()
  })
  it('shows loading, exposes a retryable error, then recovers',async()=>{
    const first=deferred(),second=deferred();const load=vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),scope=effectScope()
    const state=scope.run(()=>useStudyWeek(ref(true),ref(1),{loadStudyWeek:load,peekStudyWeek:()=>undefined}))!
    expect(state.loading.value).toBe(true);first.reject(new Error('网络失败'));await settle();expect(state.error.value).toBe('网络失败');expect(state.loading.value).toBe(false)
    const retry=state.retry();expect(state.error.value).toBe('');second.resolve(weekData(1));await retry;expect(state.course.value?.week).toBe(1);expect(state.error.value).toBe('');scope.stop()
  })
  it('ignores an older request when another week has been selected',async()=>{
    const first=deferred(),second=deferred(),scope=effectScope(),week=ref(1)
    const state=scope.run(()=>useStudyWeek(ref(true),week,{loadStudyWeek:n=>n===1?first.promise:second.promise,peekStudyWeek:()=>undefined}))!
    week.value=2;await nextTick();second.resolve(weekData(2));await settle();first.resolve(weekData(1));await settle();expect(state.course.value?.week).toBe(2);expect(state.loading.value).toBe(false);scope.stop()
  })
  it('does not reopen a course or show an old error after exiting',async()=>{
    const pending=deferred(),scope=effectScope(),active=ref(true)
    const state=scope.run(()=>useStudyWeek(active,ref(1),{loadStudyWeek:()=>pending.promise,peekStudyWeek:()=>undefined}))!
    active.value=false;await nextTick();pending.reject(new Error('Late error'));await settle();expect(state.loading.value).toBe(false);expect(state.error.value).toBe('');expect(state.course.value).toBeUndefined();scope.stop()
  })
  it('uses cached content without showing an unnecessary loading screen',async()=>{
    const cached=weekData(1),scope=effectScope()
    const state=scope.run(()=>useStudyWeek(ref(true),ref(1),{loadStudyWeek:()=>Promise.resolve(cached),peekStudyWeek:()=>cached}))!
    expect(state.loading.value).toBe(false);expect(state.course.value).toEqual(cached);await settle();scope.stop()
  })
})
