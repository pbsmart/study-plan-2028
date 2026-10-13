import { describe, expect, it } from 'vitest'
import type { SubjectId } from '../src/model'
import { adaptCurriculum } from '../src/curriculum/adapter'
import { effectiveStatus } from '../src/curriculum/types'
import { pastPaperSources, sourcesForSubject } from '../src/curriculum/sources'
import { curriculum, curriculumCoverage, summarizeCoverage } from '../src/curriculum'
import courseJson from '../src/curriculum/study-plan-content-v1.json?raw'
type RawQuestion = { id?: string; sourceType: string; points?: number; scoring?: { points: number; criterion: string }[] }
type RawLesson = { referenceIds?: string[]; sources?: string[]; id: string; week: number; subject: string; workedExample: RawQuestion; practice: RawQuestion[]; retest: RawQuestion; diagnosticTest?: { totalPoints: number; questions: RawQuestion[] } }
const raw = JSON.parse(courseJson) as { verificationReferences: Record<string,unknown>[]; scheduleMode: string; dateBinding: boolean; thirdSubject: null; lessons: RawLesson[]; weeks: {week:number;subjects:Record<string,{topic:string;detailStatus:string;lessonId?:string}>}[]; contentCoverage:{detailedLessons:number;detailedWeeks:number[];originalQuestionItems:number;additionalDiagnosticQuestionItems:number;remainingOutlineWeeks:number[]} }

describe('honest course content status and references',()=>{
  it('registers 84 outlines and validates every published lesson and original problem',()=>{
    expect(curriculum.map(w=>w.week)).toEqual(Array.from({length:84},(_,i)=>i+1))
    expect(raw.scheduleMode).toBe('manual-week');expect(raw.dateBinding).toBe(false);expect(raw.thirdSubject).toBeNull()
    expect(new Set(raw.lessons.map(l=>l.id)).size).toBe(raw.lessons.length)
    expect(new Set(raw.lessons.map(l=>`${l.week}-${l.subject}`)).size).toBe(raw.lessons.length)
    const ids = new Set<string>();let complete=0,problems=0
    for(const w of curriculum){
      expect(Object.keys(w.subjects)).toHaveLength(8)
      const outline = raw.weeks.find(x=>x.week===w.week)!
      for(const [subject,lesson] of Object.entries(w.subjects)){
        const subjectKeys: Record<string,keyof typeof outline.subjects> = {chinese:'语文',math:'数学',english:'英语',physics:'物理',chemistry:'化学',biology:'生物',geography:'地理',politics:'政治'}
        const source = outline.subjects[subjectKeys[subject]!]
        expect(source).toBeDefined()
        if(source.detailStatus==='ready'){
          expect(effectiveStatus(lesson)).toBe('complete');complete++
          expect(raw.lessons.some(l=>l.id===('lessonId' in source?source.lessonId:undefined))).toBe(true)
          const questions=[...lesson!.examples,...lesson!.exercises,lesson!.retest.problem!]
          expect(questions).toHaveLength(4)
          for(const p of questions){expect(p).toBeDefined();expect(p.origin).toBe('original');expect(p.prompt.trim()).not.toBe('');expect(p.answer.trim()).not.toBe('');expect(p.solution.length).toBeGreaterThan(0);expect(ids.has(p.id)).toBe(false);ids.add(p.id);problems++}
        }else{
          expect(effectiveStatus(lesson)).toBe('outline');expect(lesson!.examples).toEqual([]);expect(lesson!.exercises).toEqual([]);expect(lesson!.retest.problem).toBeUndefined()
        }
        expect(subject).not.toBe('')
      }
    }
    expect(complete).toBe(raw.lessons.length);expect(problems).toBe(raw.lessons.length*4)
    expect(problems).toBe(raw.contentCoverage.originalQuestionItems)
    expect(new Set(raw.lessons.map(l=>l.week))).toEqual(new Set(raw.contentCoverage.detailedWeeks))
    expect(complete).toBe(raw.contentCoverage.detailedLessons)
    expect(curriculumCoverage.completeWeeks).toEqual(raw.contentCoverage.detailedWeeks)
    expect(curriculumCoverage.outlineLessons).toBe(raw.contentCoverage.remainingOutlineWeeks.length*8);expect(curriculumCoverage.pendingLessons).toBe(0)
  })
  it('coverage uses actual completeness, including partial and non-contiguous future batches',()=>{
    const detailed=curriculum[0]!, outline=adaptCurriculum({weeks:[{week:21,subjects:Object.fromEntries(['语文','数学','英语','物理','化学','生物','地理','政治'].map(s=>[s,{topic:'仅有周纲'}]))}],lessons:[]})[0]!
    const summary=summarizeCoverage([{...detailed,week:20},{...outline,week:21},{...detailed,week:22,subjects:{math:detailed.subjects.math}}])
    expect(summary.completeWeeks).toEqual([20]);expect(summary.completeLessons).toBe(9);expect(summary.outlineLessons).toBe(8)
    const broken={...detailed.subjects.math!,knowledge:[]}
    expect(summarizeCoverage([{...detailed,subjects:{...detailed.subjects,math:broken}}]).completeWeeks).toEqual([])
  })
  it('preserves every diagnostic, point allocation, source label and question ID',()=>{
    const expected=raw.lessons.filter(l=>l.diagnosticTest)
    const actual=curriculum.flatMap(w=>Object.values(w.subjects)).flatMap(l=>l?.diagnosticTest?[l.diagnosticTest]:[])
    expect(actual).toHaveLength(expected.length)
    const ids=new Set<string>();let count=0
    for(const d of actual){
      expect(d.questions.reduce((sum,p)=>sum+(p.points||0),0)).toBe(d.totalPoints)
      expect(d.instructions.length).toBeGreaterThan(0);expect(d.scoreInterpretation.length).toBeGreaterThan(0);expect(d.remediationMap.length).toBeGreaterThan(0)
      for(const q of d.questions){expect(q.origin).toBe('original');expect(q.scoring!.reduce((sum,r)=>sum+r.points,0)).toBe(q.points);expect(q.scoring!.every(r=>r.criterion)).toBe(true);expect(ids.has(q.id)).toBe(false);ids.add(q.id);count++}
    }
    expect(count).toBe(raw.contentCoverage.additionalDiagnosticQuestionItems)
    for(const l of raw.lessons){for(const q of [l.workedExample,...l.practice,l.retest,...(l.diagnosticTest?.questions||[])])expect(q.sourceType).toBe('original')}
    expect([...ids].sort()).toEqual(expected.flatMap(l=>l.diagnosticTest!.questions.map(q=>q.id!)).sort())
  })
  it('preserves all explicitly linked principle and public-domain reference URLs',()=>{
    const subjects:Record<string,SubjectId>={语文:'chinese',数学:'math',英语:'english',物理:'physics',化学:'chemistry',生物:'biology',地理:'geography',政治:'politics'}
    let checked=0
    for(const ref of raw.verificationReferences){
      if(typeof ref.url!=='string' || !/^https?:\/\//.test(ref.url))continue
      const ids=[ref.lessonId,...['lessonIds','lessons','appliesTo','usedIn'].flatMap(key=>Array.isArray(ref[key])?ref[key] as string[]:[])].filter((id):id is string=>typeof id==='string')
      const lessons=raw.lessons.filter(l=>ids.includes(l.id) || [...(l.referenceIds||[]),...(l.sources||[])].includes(String(ref.id)))
      for(const lesson of lessons){const adapted=curriculum.find(w=>w.week===lesson.week)!.subjects[subjects[lesson.subject]!]!;expect(adapted.contentReferences?.map(r=>r.url)).toContain(ref.url);checked++}
    }
    expect(checked).toBeGreaterThan(100)
  })
  it('preserves distinct explanations alongside steps and suppresses joined-step duplicates',()=>{
    const english=curriculum.find(w=>w.week===80)!.subjects.english!.examples[0]!
    expect(english.solution.some(s=>s.includes('确切成因尚不清楚，更不支持声学原因诊断'))).toBe(true)
    const chinese=curriculum.find(w=>w.week===77)!.subjects.chinese!.examples[0]!
    expect(chinese.solution.some(s=>s.includes('本课程原创现代诗'))).toBe(true)
    expect(curriculum.find(w=>w.week===49)!.subjects.english!.examples[0]!.solution).toHaveLength(4)
  })
  it('rejects incomplete diagnostic scoring instead of silently presenting it',()=>{
    const d={weeks:[{week:1,subjects:{数学:{topic:'测试'}}}],lessons:[{week:1,subject:'数学',diagnosticTest:{sourceType:'original',totalPoints:10,questions:[{id:'test',sourceType:'original',question:'题目',answer:'答案',explanation:'解释',points:10,scoring:[{points:5,criterion:'不完整'}]}]}}]}
    expect(()=>adaptCurriculum(d)).toThrow('分值不完整')
  })
  it('does not turn an outline into a fully explained course',()=>{
    const data=adaptCurriculum({scheduleMode:'manual-week',dateBinding:false,weeks:[{week:5,title:'基础巩固',phase:'基础',subjects:{数学:{topic:'函数',detailStatus:'ready',pastPapers:[]}}}],lessons:[]})
    expect(effectiveStatus(data[0]!.subjects.math)).toBe('outline');expect(data[0]!.subjects.math!.examples).toEqual([]);expect(data[0]!.subjects.math!.exercises).toEqual([])
  })
  it('labels absent or explicitly pending content as pending',()=>{expect(effectiveStatus()).toBe('pending');const course=adaptCurriculum({weeks:[{week:1,subjects:{地理:{topic:'待补充',detailStatus:'待补充'}}}],lessons:[]});expect(effectiveStatus(course[0]!.subjects.geography)).toBe('pending')})
  it('rejects calendar-bound course files and duplicate weekly IDs',()=>{expect(()=>adaptCurriculum({dateBinding:true,weeks:[],lessons:[]})).toThrow();expect(()=>adaptCurriculum({weeks:[{week:1},{week:1}],lessons:[]})).toThrow()})
  it('never labels imported third-party questions as original',()=>{
    expect(()=>adaptCurriculum({weeks:[{week:1,subjects:{数学:{topic:'基础'}}}],lessons:[{week:1,subject:'数学',workedExample:{question:'question',sourceType:'past-paper'}}]})).toThrow('原创')
  })
  it('keeps all supplied sources as official analysis instead of full original papers',()=>{
    expect(pastPaperSources).toHaveLength(8);expect(pastPaperSources.every(s=>s.kind==='official-analysis'&&s.year&&s.paper&&s.publisher&&s.url.startsWith('https://'))).toBe(true)
    expect(sourcesForSubject('geography')).toEqual([]);expect(sourcesForSubject('politics')).toEqual([])
    expect(sourcesForSubject('biology').map(s=>s.id)).toEqual(['zhejiang-electives-commentary-2025'])
    expect(sourcesForSubject('chemistry').find(s=>s.id==='chem-national-comprehensive-2025')!.paper).toContain('非河南')
  })
})
