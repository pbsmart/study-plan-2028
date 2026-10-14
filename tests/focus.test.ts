import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { lessonSteps, learningHash, parseLearningRoute } from '../src/focus'
import type { SubjectWeek } from '../src/curriculum/types'
import type { EnrichedLesson } from '../src/curriculum/enriched-types'
import FocusLesson from '../src/components/FocusLesson.vue'
import WeekLesson from '../src/components/WeekLesson.vue'
import EnrichedLessonContent from '../src/components/EnrichedLessonContent.vue'
import LessonDiagram from '../src/components/LessonDiagram.vue'

const problem = { id: 'problem1', origin: 'original' as const, title: '原创题', prompt: 'QUESTION ONLY', answer: 'HIDDEN ANSWER', solution: ['步骤一'] }
const lesson: SubjectWeek = { status:'complete', title:'当前数学课', goals:['目标'], prerequisites:['前置'], knowledge:[{title:'知识',paragraphs:['当前知识正文']}], examPoints:['考点'], examples:[problem], exercises:[{...problem,id:'practice1'}], retest:{tasks:[problem.prompt],problem:{...problem,id:'retest1'},criteria:['掌握标准']},sourceIds:[] }
const render = (component: Parameters<typeof createSSRApp>[0], props: Record<string, unknown>) => renderToString(createSSRApp(component, props))
const extra = { id:'w1-test',week:1,subject:'数学',title:'深化样板',revision:'week01-enriched-v1',status:'pilot-ready',objectives:['目标'],prerequisites:['基础'],budget:{coreMinutes:120,busyMinutes:60,extensionMinutes:15,busyPolicy:'可跨周期',segments:[]},diagnostic:{instructions:'先独立自测',questions:[],routes:[]},sections:[{id:'w1-math-s1',title:'第一小节',level:'core',paragraphs:['分段正文'],keyPoints:['要点'],checkpoint:{question:'先想一想',answer:'核对答案',explanation:'解释原因'}}],workedExamples:[{...problem,id:'w1-math-ex1',level:'core',difficulty:'foundation',steps:['解析'],commonErrors:[],estimatedMinutes:10}],practice:[],misconceptions:[],quiz:{instructions:'独立短测',totalPoints:20,questions:[],passRule:{minScore:16,requiredChecks:['关键条件']},remediation:[]},mastery:['独立解释'],nextStep:'没有自动跳周',sourcePolicy:{authorship:'原创',examStatus:'非真题',externalSources:[]}} as EnrichedLesson

describe('focus lesson structure and routes',()=>{
  it('validates deep links without changing persistent progress',()=>{
    expect(parseLearningRoute('#learn/84/math/practice',84,['math'])).toEqual({week:84,subject:'math',step:'practice'})
    expect(parseLearningRoute('#learn/1/math/w1-math-s1',84,['math'])?.step).toBe('w1-math-s1')
    for(const hash of ['#learn/0/math','#learn/85/math','#learn/1/politics','#learn/1/math/<script>','#learn/1/math/a/b']) expect(parseLearningRoute(hash,84,['math'])).toBeNull()
    expect(learningHash(2,'math','retest')).toBe('#learn/2/math/retest')
  })
  it('only creates available steps and never invents completed tasks',()=>{
    expect(lessonSteps(undefined)).toEqual([{id:'prepare',title:'学习准备'}])
    expect(lessonSteps(lesson).map(step=>step.id)).toEqual(['prepare','knowledge','examples','practice','retest'])
    const steps=lessonSteps({...lesson,enrichment:extra});expect(steps.map(step=>step.id)).toEqual(['prepare','diagnostic','w1-math-s1','w1-math-ex1','quiz','review'])
    expect(steps.filter(step=>step.checkpoint==='knowledge')).toHaveLength(1)
  })
  it('renders only the current section, with a closed directory and source details',async()=>{
    const html=await render(FocusLesson,{week:2,subject:'math',subjectLabel:'数学',lesson,completed:[],step:'knowledge'})
    expect(html).toContain('当前知识正文');expect(html).not.toContain('QUESTION ONLY');expect(html).not.toContain('HIDDEN ANSWER')
    expect(html).not.toContain('record-section');expect(html).not.toContain('subject-tabs');expect(html).not.toContain('sidebar')
    expect(html).toContain('本课目录');expect(html).toContain('上一节');expect(html).toContain('下一节')
    expect(html).not.toMatch(/<details[^>]*\bopen/);expect(html).not.toContain('checked')
  })
  it('keeps exercise answers behind a native closed disclosure',async()=>{
    const html=await render(FocusLesson,{week:2,subject:'math',subjectLabel:'数学',lesson,completed:[],step:'practice'})
    expect(html).toContain('QUESTION ONLY');expect(html).toMatch(/<details><summary>完成后核对答案与解析<\/summary>/)
    expect(html).not.toContain('当前知识正文');expect(html).not.toMatch(/<details[^>]*\bopen/)
  })
  it('removes a duplicate retest prompt while retaining distinct instructions',async()=>{
    const html=await render(WeekLesson,{week:2,subject:'math',lesson:{...lesson,retest:{...lesson.retest,tasks:[' QUESTION\n ONLY ', '先闭卷作答']}},completed:[],section:'retest'})
    expect(html.split('QUESTION ONLY')).toHaveLength(2);expect(html).toContain('先闭卷作答')
  })
  it('renders enriched sections and checkpoint answers without flattening or leaking later questions',async()=>{
    const html=await render(EnrichedLessonContent,{lesson:extra,step:'w1-math-s1'})
    for(const text of ['分段正文','要点','先想一想','核对答案','解释原因']) expect(html).toContain(text)
    expect(html).not.toContain('QUESTION ONLY');expect(html).not.toMatch(/<details[^>]*\bopen/)
    const quiz=await render(EnrichedLessonContent,{lesson:extra,step:'quiz'});expect(quiz).toContain('独立短测');expect(quiz).toContain('共 20 分')
  })
  it('keeps source boundaries and original labels in the focus view',async()=>{
    const html=await render(FocusLesson,{week:1,subject:'math',subjectLabel:'数学',lesson:{...lesson,enrichment:extra},completed:[],step:'w1-math-ex1'})
    expect(html).toContain('深化样板');expect(html).toContain('原创例题（非历年真题）');expect(html).toContain('未提供原题全文')
    expect(html).not.toContain('[object Object]')
  })
  it('preserves old check-ins without claiming that the enlarged lesson was completed',async()=>{
    const html=await render(FocusLesson,{week:1,subject:'math',subjectLabel:'数学',lesson:{...lesson,enrichment:extra},completed:['w1-math-knowledge'],step:'w1-math-s1'})
    expect(html).toContain('checked');expect(html).toContain('本周学习打卡');expect(html).toContain('沿用本周历史打卡，不代表深化内容已完成')
    expect(html).not.toContain('全部核心');expect(html).not.toContain('我已实际完成知识学习')
  })
  it('renders accessible monochrome diagrams with the route and displacement kept distinct',async()=>{
    const html=await render(LessonDiagram,{diagram:{id:'route',title:'路程与位移',kind:'number-line',description:'分两段走，另画端点位移',altText:'从0走到4，再返回1，位移为正1米',axis:{unit:'m',positiveDirection:'向右为正',min:-1,max:5,ticks:[0,1,2,3,4]},points:[{label:'起点',x:0},{label:'终点',x:1}],route:[{from:0,to:4,label:'第一段4米'},{from:4,to:1,label:'第二段3米'}],displacement:{from:0,to:1,label:'位移+1米'},linkedSectionIds:[]}})
    expect(html).toContain('role="img"');for(const text of ['第一段4米','第二段3米','位移+1米','从0走到4'])expect(html).toContain(text)
  })
})
