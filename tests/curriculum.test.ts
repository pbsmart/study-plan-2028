import { describe, expect, it } from 'vitest'
import { adaptCurriculum } from '../src/curriculum/adapter'
import { effectiveStatus } from '../src/curriculum/types'
import { pastPaperSources, sourcesForSubject } from '../src/curriculum/sources'
import { curriculum } from '../src/curriculum'

describe('honest course content status and references',()=>{
  it('registers all 84 outlines, exactly 32 complete lessons and 128 original problems',()=>{
    expect(curriculum.map(w=>w.week)).toEqual(Array.from({length:84},(_,i)=>i+1))
    let complete=0,problems=0
    for(const w of curriculum){expect(Object.keys(w.subjects)).toHaveLength(8);for(const lesson of Object.values(w.subjects)){
      expect(effectiveStatus(lesson)).toBe(w.week<=4?'complete':'outline')
      if(w.week<=4){complete++;problems+=lesson!.examples.length+lesson!.exercises.length+(lesson!.retest.problem?1:0)}
      else{expect(lesson!.examples).toEqual([]);expect(lesson!.exercises).toEqual([]);expect(lesson!.retest.problem).toBeUndefined()}
    }}
    expect(complete).toBe(32);expect(problems).toBe(128)
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
