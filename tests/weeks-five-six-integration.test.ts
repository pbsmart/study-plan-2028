import { describe, expect, it } from 'vitest'
import { readFile, stat, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { loadStudyWeek } from '../src/curriculum'
import { readCurriculumData } from '../src/curriculum/vite-plugin'
import { lessonSteps } from '../src/focus'
import { defaultData, parseBackup } from '../src/model'
import { learningContexts, MAX_CONTEXT_LENGTH } from '../src/ai/context'
import type { SubjectId } from '../src/model'
import FocusLesson from '../src/components/FocusLesson.vue'
import integrity from './fixtures/weeks-five-six-integrity.json'
const subjects = ['chinese','math','english','physics','chemistry'] as const
const source = (path:string) => new URL(`../src/curriculum/${path}`,import.meta.url)
const renderStep = async(weekNumber:number,subject:SubjectId,step:string,completed:string[]=[]) => {
  const week=await loadStudyWeek(weekNumber),lesson=week.subjects[subject]!
  return renderToString(createSSRApp(FocusLesson,{week:weekNumber,subject,subjectLabel:lesson.enrichment!.subject,lesson,completed,step}))
}
const escaped = (text:string) => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')

describe('frozen weeks five and six integration',()=>{
  it.each([5,6])('limits English listening warnings to English in week %i while keeping author audio notes',async(weekNumber)=>{
    const week=await loadStudyWeek(weekNumber)
    for(const subject of ['english','physics','chemistry'] as const){
      const lesson=week.subjects[subject]!,prepare=await renderStep(weekNumber,subject,'prepare')
      expect(prepare).toContain(escaped(lesson.enrichment!.audioStatus!))
      const checkpoint=lessonSteps(lesson).find(step=>step.checkpoint)!,study=await renderStep(weekNumber,subject,checkpoint.id)
      if(subject==='english'){
        expect(prepare).toContain('听力文字预训练，无音频')
        expect(study).toContain('听力打卡仅表示文字预训练')
      }else{
        expect(prepare).not.toContain('听力文字预训练，无音频')
        expect(study).not.toContain('听力打卡仅表示文字预训练')
      }
    }
  })
  it('preserves all ten lessons, twenty SVGs and six sidecars author-identically',async()=>{
    expect(integrity).toHaveLength(36);expect(integrity.filter(file=>file.path.endsWith('.svg'))).toHaveLength(20)
    for(const file of integrity){const bytes=await readFile(source(file.path));expect(bytes.length,file.path).toBe(file.bytes);expect(createHash('sha256').update(bytes).digest('hex'),file.path).toBe(file.sha256)}
  })
  it.each([5,6])('shows week %i ten figures only at author-associated locations and retains text alternatives',async(weekNumber)=>{
    const week=await loadStudyWeek(weekNumber)
    expect(Object.values(week.subjects).flatMap(lesson=>lesson?.enrichmentFigures||[])).toHaveLength(10)
    for(const subject of subjects){const lesson=week.subjects[subject]!
      expect(lesson.enrichmentReviewMap).toBeUndefined()
      for(const figure of lesson.enrichmentFigures||[]){
        expect(figure.src).toContain('.svg');expect(figure.altText.length).toBeGreaterThan(20)
        expect(figure.answerOnly||false).toBe(weekNumber===5&&figure.id==='w5-physics-figure4')
        for(const step of figure.linkedSectionIds){const html=await renderStep(weekNumber,subject,step);expect(html).toContain(`data-figure-id="${figure.id}"`);expect(html).toContain(escaped(figure.altText));expect(html).not.toContain('<svg')}
        for(const id of figure.linkedQuestionIds){const html=await renderStep(weekNumber,subject,id),position=html.indexOf(`data-figure-id="${figure.id}"`),opening=html.lastIndexOf('<details',position)
          expect(position).toBeGreaterThan(-1);expect(opening).toBeGreaterThan(-1);expect(html.indexOf('</details>',opening)).toBeGreaterThan(position);expect(html).not.toMatch(/<details[^>]*\bopen/)
        }
      }
    }
  })
  it('keeps week-five physics example-four answer figure and equivalent answer text out of every other step',async()=>{
    const lesson=(await loadStudyWeek(5)).subjects.physics!,figure=lesson.enrichmentFigures!.find(figure=>figure.id==='w5-physics-figure4')!
    expect(figure.answerOnly).toBe(true);expect(figure.linkedQuestionIds).toEqual(['w5-physics-ex4'])
    for(const step of lessonSteps(lesson).filter(step=>step.id!=='w5-physics-ex4')){const html=await renderStep(5,'physics',step.id);expect(html).not.toContain(`data-figure-id="${figure.id}"`);expect(html).not.toContain(escaped(figure.altText))}
  })
  it.each([5,6])('retains week %i budget, optional boundaries, one regular quiz and original check-ins',async(weekNumber)=>{
    const week=await loadStudyWeek(weekNumber),record=defaultData();record.weeks[String(weekNumber)]={workload:'normal',completed:[`w${weekNumber}-math-knowledge`],sessions:[]}
    expect(parseBackup(JSON.stringify(record))).toEqual(record)
    const step=lessonSteps(week.subjects.math).find(step=>step.checkpoint==='knowledge')!
    expect(await renderStep(weekNumber,'math',step.id,record.weeks[String(weekNumber)]!.completed)).toContain('不代表深化内容已完成')
    expect(record.currentWeek).toBe(1);expect(record.settings.thirdConfirmed).toBe(false)
    expect(subjects.reduce((sum,subject)=>sum+week.subjects[subject]!.enrichment!.budget.coreMinutes,0)).toBe(870)
    for(const subject of subjects){const lesson=week.subjects[subject]!,content=lesson.enrichment!,steps=lessonSteps(lesson)
      expect(content.budget.segments.reduce((sum,segment)=>sum+segment.minutes,0)).toBe(content.budget.coreMinutes)
      expect(content.quiz.totalPoints).toBe(20);expect(content.quiz.passRule.minScore).toBe(16);expect(content.quiz.passRule.requiredChecks.length).toBeGreaterThan(0)
      expect(steps.filter(step=>step.id==='quiz')).toEqual([{id:'quiz',title:'20 分短测'}]);expect(steps.some(step=>step.id==='retest')).toBe(false)
      for(const optional of [...content.sections,...content.workedExamples,...content.practice].filter(item=>item.level==='extension'))expect(steps.find(step=>step.id===optional.id)).toMatchObject({optional:true})
      expect(await renderStep(weekNumber,subject,'prepare')).toContain(escaped(content.budget.busyPolicy))
      expect(await renderStep(weekNumber,subject,'review')).not.toContain('cumulative-review-map')
    }
    for(const subject of ['biology','geography','politics'] as const)expect(week.subjects[subject]?.enrichment).toBeUndefined()
  })
  it('continues to reject external DTDs and active SVG content rather than weakening validation for exported figures',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'study-week-five-svg-'))
    try{
      await mkdir(join(directory,'assets'));await writeFile(join(directory,'physics.json'),await readFile(source('enriched-week-05/physics.json')))
      const figures=JSON.parse(await readFile(source('enriched-week-05/assets/physics-figures.json'),'utf8')),figure=figures[0]
      await writeFile(join(directory,'assets/physics-figures.json'),JSON.stringify([figure]))
      const config={week:5,revision:'week05-enriched-v1',directory,figureManifests:[{subject:'physics',file:'assets/physics-figures.json'}]}
      for(const svg of ['<!DOCTYPE svg SYSTEM "https://example.invalid/svg.dtd"><svg viewBox="0 0 10 10"/>','<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>','<svg viewBox="0 0 10 10"><image href="https://example.invalid/pixel.svg"/></svg>']){
        await writeFile(join(directory,figure.asset),svg);await expect(readCurriculumData({enrichments:[config]})).rejects.toThrow('活动内容或外部资源')
      }
    }finally{await rm(directory,{recursive:true,force:true})}
  })
  it('watches only actual source files and keeps new resources out of other weeks',async()=>{
    const data=await readCurriculumData();expect(data.sourceFiles.filter(file=>file.endsWith('.svg'))).toHaveLength(87)
    for(const file of data.sourceFiles)expect((await stat(file)).isFile()).toBe(true)
    for(const week of data.weeks.filter(week=>week.week>12))for(const lesson of Object.values(week.subjects)){expect(lesson?.enrichment).toBeUndefined();expect(lesson?.enrichmentFigures).toBeUndefined()}
  })
})

describe('new content preserves the unchanged AI context allowlist',()=>{
  it.each([5,6])('offers only one current week %i section or question, with no answers, SVG metadata, scores or review maps',async(weekNumber)=>{
    const week=await loadStudyWeek(weekNumber)
    for(const subject of subjects){const lesson=structuredClone(week.subjects[subject]!),content=lesson.enrichment!
      for(const section of content.sections){section.checkpoint.answer='HIDDEN_CHECKPOINT_ANSWER';section.checkpoint.explanation='HIDDEN_CHECKPOINT_EXPLANATION'}
      const questions=[...content.diagnostic.questions,...content.workedExamples,...content.practice,...content.quiz.questions]
      for(const question of questions){question.answer='HIDDEN_ANSWER';question.steps=['HIDDEN_STEPS'];question.commonErrors=['HIDDEN_ERRORS'];question.scoring=[{points:1,criterion:'HIDDEN_SCORING'}]}
      for(const figure of lesson.enrichmentFigures||[]){figure.altText='HIDDEN_FIGURE';figure.caption='HIDDEN_CAPTION'}
      for(const step of lessonSteps(lesson)){
        const contexts=learningContexts(lesson,step.id,weekNumber,content.subject)
        for(const context of contexts){expect(context.text).not.toContain('HIDDEN_');expect(context.text.length).toBeLessThanOrEqual(MAX_CONTEXT_LENGTH)}
        const section=content.sections.find(section=>section.id===step.id),question=questions.find(question=>question.id===step.id)
        if(section){expect(contexts).toHaveLength(1);expect(contexts[0]!.id).toBe(section.id);expect(contexts[0]!.text).toContain(section.paragraphs[0])}
        else if(question){expect(contexts).toHaveLength(1);expect(contexts[0]!.id).toBe(question.id);expect(contexts[0]!.text).toContain(question.prompt)}
        else if(step.id==='quiz'||step.id==='diagnostic'){const expected=step.id==='quiz'?content.quiz.questions:content.diagnostic.questions;expect(contexts.map(context=>context.id)).toEqual(expected.map(question=>question.id));for(const [index,context]of contexts.entries())expect(context.text).toContain(expected[index]!.prompt)}
        else expect(contexts).toEqual([])
      }
    }
  })
})
