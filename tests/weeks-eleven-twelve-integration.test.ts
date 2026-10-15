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
import { normalizeReviewMap } from '../src/curriculum/review-map'
import { learningContexts, MAX_CONTEXT_LENGTH } from '../src/ai/context'
import type { SubjectId } from '../src/model'
import FocusLesson from '../src/components/FocusLesson.vue'
import integrity from './fixtures/weeks-eleven-twelve-integrity.json'
import protectedFiles from './fixtures/weeks-eleven-twelve-protected.json'
import podcastIntegrity from './fixtures/podcast-integration-integrity.json'
import redesignIntegrity from './fixtures/ui-redesign-integrity.json'
import { enrichmentConfigs } from '../src/curriculum/enrichment-config'
const answerLinks = [
  {week:11,subject:'physics',figureId:'w11-physics-figure2',questionId:'w11-physics-ex3'},
  {week:11,subject:'physics',figureId:'w11-physics-figure3',questionId:'w11-physics-ex4'},
  {week:12,subject:'math',figureId:'w12-math-exp-absolute',questionId:'w12-math-ex4'},
  {week:12,subject:'physics',figureId:'w12-physics-figure2',questionId:'w12-physics-ex1'},
  {week:12,subject:'physics',figureId:'w12-physics-figure3',questionId:'w12-physics-ex3'},
  {week:12,subject:'physics',figureId:'w12-physics-figure4',questionId:'w12-physics-quiz4'},
] as const
const expectedMaps = {
 chinese:{minutes:28,rows:22,weeks:[1,3,4,5,6,8,9,10,11,12]},
 math:{minutes:35,rows:21,weeks:[4,5,6,7,8,9,10,11,12]},
 english:{minutes:32,rows:26,weeks:[1,2,3,4,5,6,7,8,9,10,11,12]},
 physics:{minutes:25,rows:20,weeks:[1,2,3,5,6,7,8,9,10,11,12]},
 chemistry:{minutes:24,rows:20,weeks:[3,4,5,6,7,8,9,10,11,12]},
} as const
const subjects = ['chinese','math','english','physics','chemistry'] as const
const source = (path:string) => new URL(`../src/curriculum/${path}`,import.meta.url)
const renderStep = async(weekNumber:number,subject:SubjectId,step:string,completed:string[]=[]) => {
  const week=await loadStudyWeek(weekNumber),lesson=week.subjects[subject]!
  return renderToString(createSSRApp(FocusLesson,{week:weekNumber,subject,subjectLabel:lesson.enrichment!.subject,lesson,completed,step}))
}
const escaped = (text:string) => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')

describe('frozen weeks eleven and twelve integration',()=>{
  it('preserves the deployed UI, AI, progress, all earlier courses, workflow and prior enrichment configuration',async()=>{
    expect(protectedFiles.baselineCommit).toBe('dfac13acf18804f73abb1cceb5cda2ff147dfe84')
    const podcastFiles: Record<string,{bytes:number;sha256:string}> = { ...podcastIntegrity.files, ...redesignIntegrity.files }
    for(const file of protectedFiles.files){const expected=podcastFiles[file.path] || file;const bytes=await readFile(new URL(`../${file.path}`,import.meta.url));expect(bytes.length,file.path).toBe(expected.bytes);expect(createHash('sha256').update(bytes).digest('hex'),file.path).toBe(expected.sha256)}
    expect((await readFile(source('enrichment-config.ts'),'utf8')).startsWith(protectedFiles.priorConfigPrefix)).toBe(true)
    expect(enrichmentConfigs.map(config=>config.week)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12])
    for(const week of [11,12])expect(enrichmentConfigs.find(config=>config.week===week)!.answerOnlyFigureIds).toEqual(answerLinks.filter(link=>link.week===week).map(link=>link.figureId))
  })
  it('watches exactly 36 new runtime sources and excludes author QA, rubric, handouts, images and scripts',async()=>{
    const data=await readCurriculumData(),files=data.sourceFiles.map(path=>path.replaceAll('\\','/')).filter(path=>/enriched-week-(?:11|12)\//.test(path))
    expect(files).toHaveLength(36)
    for(const file of files)expect(file).not.toMatch(/\/(?:qa|handouts)\/|rubric|\.png$|\.py$/)
    expect(files.filter(file=>file.endsWith('-review-map.json'))).toHaveLength(5)
    expect(files.filter(file=>/enriched-week-11\/.*review-map/.test(file))).toHaveLength(0)
  })
  it('keeps week-eleven Chinese three complete writing practices at exactly 20 minutes without weakening other subjects',async()=>{
    for(const week of [11,12])for(const subject of subjects){
      const content=(await loadStudyWeek(week)).subjects[subject]!.enrichment!
      if(week===11&&subject==='chinese'){
        expect(content.practice).toHaveLength(3);expect(content.practice.map(question=>question.estimatedMinutes)).toEqual([6,7,7])
        const ids=new Set(content.practice.map(question=>question.id)),segments=content.budget.segments.filter(segment=>segment.activityIds.some(id=>ids.has(id)))
        expect(segments.reduce((sum,segment)=>sum+segment.minutes,0)).toBe(20)
        expect(lessonSteps((await loadStudyWeek(week)).subjects[subject]).filter(step=>ids.has(step.id))).toHaveLength(3)
      }else expect(content.practice.length).toBeGreaterThanOrEqual(4)
      const coreIds=[...content.sections,...content.diagnostic.questions,...content.workedExamples,...content.practice,...content.quiz.questions].filter(item=>item.level!=='extension').map(item=>item.id)
      if(content.reviewActivity)coreIds.push(content.reviewActivity.id)
      const budgetIds=content.budget.segments.flatMap(segment=>segment.activityIds)
      expect([...budgetIds].sort()).toEqual([...coreIds].sort());expect(new Set(budgetIds).size).toBe(budgetIds.length)
    }
  })

  it.each([11,12])('limits English listening warnings to English in week %i while keeping author audio notes',async(weekNumber)=>{
    const week=await loadStudyWeek(weekNumber)
    for(const subject of subjects){
      const lesson=week.subjects[subject]!,prepare=await renderStep(weekNumber,subject,'prepare')
      if(lesson.enrichment!.audioStatus)expect(prepare).toContain(escaped(lesson.enrichment!.audioStatus))
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
  it('preserves all ten lessons, fifteen SVGs, six sidecars and five review maps author-identically',async()=>{
    expect(integrity).toHaveLength(36);expect(integrity.filter(file=>file.path.endsWith('.svg'))).toHaveLength(15)
    for(const file of integrity){const bytes=await readFile(source(file.path));expect(bytes.length,file.path).toBe(file.bytes);expect(createHash('sha256').update(bytes).digest('hex'),file.path).toBe(file.sha256)}
  })
  it.each([11,12])('shows week %i configured figures only at author-associated locations and retains text alternatives',async(weekNumber)=>{
    const week=await loadStudyWeek(weekNumber)
    expect(Object.values(week.subjects).flatMap(lesson=>lesson?.enrichmentFigures||[])).toHaveLength(weekNumber===11?7:8)
    for(const subject of subjects){const lesson=week.subjects[subject]!
      if(weekNumber===11)expect(lesson.enrichmentReviewMap).toBeUndefined();else expect(lesson.enrichmentReviewMap?.totalPoints).toBe(20)
      for(const figure of lesson.enrichmentFigures||[]){
        expect(figure.src).toContain('.svg');expect(figure.altText.length).toBeGreaterThan(20)
        expect(figure.answerOnly||false).toBe(answerLinks.some(link=>link.figureId===figure.id))
        for(const step of figure.linkedSectionIds){const html=await renderStep(weekNumber,subject,step);expect(html).toContain(`data-figure-id="${figure.id}"`);expect(html).toContain(escaped(figure.altText));expect(html).not.toContain('<svg')}
        for(const id of figure.linkedQuestionIds){const html=await renderStep(weekNumber,subject,lesson.enrichment!.quiz.questions.some(question=>question.id===id)?'quiz':id),position=html.indexOf(`data-figure-id="${figure.id}"`),opening=html.lastIndexOf('<details',position)
          expect(position).toBeGreaterThan(-1);expect(opening).toBeGreaterThan(-1);expect(html.indexOf('</details>',opening)).toBeGreaterThan(position);expect(html).not.toMatch(/<details[^>]*\bopen/)
        }
      }
    }
  })
  it.each(answerLinks)('keeps $figureId and answer text only in the closed solution of $questionId',async({week,subject,figureId,questionId})=>{
    const lesson=(await loadStudyWeek(week)).subjects[subject]!,figure=lesson.enrichmentFigures!.find(figure=>figure.id===figureId)!
    expect(figure.answerOnly).toBe(true);expect(figure.linkedQuestionIds).toEqual([questionId]);expect(figure.linkedSectionIds).toEqual([])
    const target=lesson.enrichment!.quiz.questions.some(question=>question.id===questionId)?'quiz':questionId
    for(const step of lessonSteps(lesson)){
      const html=await renderStep(week,subject,step.id),id=`data-figure-id="${figureId}"`
      if(step.id!==target){expect(html).not.toContain(id);expect(html).not.toContain(escaped(figure.altText))}
      else{
        const at=html.indexOf(id),opening=html.lastIndexOf('<details',at)
        expect(at).toBeGreaterThan(-1);expect(opening).toBeGreaterThan(-1);expect(html.indexOf('</details>',opening)).toBeGreaterThan(at);expect(html).not.toMatch(/<details[^>]*\bopen/)
        // Quiz figures must be scoped to their exact question card, not the whole quiz's answers.
        const cardStart=html.lastIndexOf('<article class="problem-card"',at),cardEnd=html.indexOf('</article>',at),card=html.slice(cardStart,cardEnd)
        const question=lesson.enrichment!.quiz.questions.find(question=>question.id===questionId)||lesson.enrichment!.workedExamples.find(question=>question.id===questionId)!
        if(target==='quiz'){
          expect(card).toContain(escaped(question.title));expect(html.match(new RegExp(`data-figure-id="${figureId}"`,'g'))).toHaveLength(1)
          for(const other of lesson.enrichment!.quiz.questions.filter(question=>question.id!==questionId))expect(card).not.toContain(escaped(other.title))
        }
      }
    }
  })
  it.each([11,12])('retains week %i budget, optional boundaries, one existing assessment and original check-ins',async(weekNumber)=>{
    const week=await loadStudyWeek(weekNumber),record=defaultData();record.weeks[String(weekNumber)]={workload:'normal',completed:[`w${weekNumber}-math-knowledge`],sessions:[]}
    expect(parseBackup(JSON.stringify(record))).toEqual(record)
    const step=lessonSteps(week.subjects.math).find(step=>step.checkpoint==='knowledge')!
    expect(await renderStep(weekNumber,'math',step.id,record.weeks[String(weekNumber)]!.completed)).toContain('不代表深化内容已完成')
    expect(record.currentWeek).toBe(1);expect(record.settings.thirdConfirmed).toBe(false)
    expect(subjects.reduce((sum,subject)=>sum+week.subjects[subject]!.enrichment!.budget.coreMinutes,0)).toBe(870)
    for(const subject of subjects){const lesson=week.subjects[subject]!,content=lesson.enrichment!,steps=lessonSteps(lesson)
      expect(content.budget.segments.reduce((sum,segment)=>sum+segment.minutes,0)).toBe(content.budget.coreMinutes)
      expect(content.quiz.totalPoints).toBe(20);expect(content.quiz.passRule.minScore).toBe(16);expect(content.quiz.passRule.requiredChecks.length).toBeGreaterThan(0)
      expect(steps.filter(step=>step.id==='quiz')).toEqual([{id:'quiz',title:weekNumber===12?'20 分累计诊断':'20 分短测'}]);expect(steps.some(step=>step.id==='retest')).toBe(false)
      for(const optional of [...content.sections,...content.workedExamples,...content.practice].filter(item=>item.level==='extension'))expect(steps.find(step=>step.id===optional.id)).toMatchObject({optional:true})
      expect(await renderStep(weekNumber,subject,'prepare')).toContain(escaped(content.budget.busyPolicy))
      if(weekNumber===11)expect(await renderStep(weekNumber,subject,'review')).not.toContain('cumulative-review-map')
    }
    for(const subject of ['biology','geography','politics'] as const)expect(week.subjects[subject]?.enrichment).toBeUndefined()
  })
  it('continues to reject external DTDs and active SVG content rather than weakening validation for exported figures',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'study-week-eleven-svg-'))
    try{
      await mkdir(join(directory,'assets'));await writeFile(join(directory,'physics.json'),await readFile(source('enriched-week-11/physics.json')))
      const figures=JSON.parse(await readFile(source('enriched-week-11/assets/physics-figures.json'),'utf8')),figure=figures[0]
      await writeFile(join(directory,'assets/physics-figures.json'),JSON.stringify([figure]))
      const config={week:11,revision:'week11-enriched-v1',directory,figureManifests:[{subject:'physics',file:'assets/physics-figures.json'}]}
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
  it.each([11,12])('offers only one current week %i section or question, with no answers, SVG metadata, scores or review maps',async(weekNumber)=>{
    const week=await loadStudyWeek(weekNumber)
    for(const subject of subjects){const lesson=structuredClone(week.subjects[subject]!),content=lesson.enrichment!
      for(const section of content.sections){section.checkpoint.answer='HIDDEN_CHECKPOINT_ANSWER';section.checkpoint.explanation='HIDDEN_CHECKPOINT_EXPLANATION'}
      const questions=[...content.diagnostic.questions,...content.workedExamples,...content.practice,...content.quiz.questions]
      for(const question of questions){question.answer='HIDDEN_ANSWER';question.steps=['HIDDEN_STEPS'];question.commonErrors=['HIDDEN_ERRORS'];question.scoring=[{points:1,criterion:'HIDDEN_SCORING'}]}
      for(const figure of lesson.enrichmentFigures||[]){figure.altText='HIDDEN_FIGURE';figure.caption='HIDDEN_CAPTION'}
      for(const question of lesson.enrichmentReviewMap?.questions||[])for(const skill of question.skills)skill.skill='HIDDEN_REVIEW_SKILL'
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

describe('week-twelve existing quiz is cumulative, with review-only skill mapping',()=>{
  it.each(subjects)('normalizes %s cumulative mapping without changing questions, points, minutes or source data',async(subject)=>{
    const lesson=(await loadStudyWeek(12)).subjects[subject]!,content=lesson.enrichment!,map=lesson.enrichmentReviewMap!
    const raw=JSON.parse(await readFile(source(`enriched-week-12/assets/${subject}-review-map.json`),'utf8')),before=JSON.stringify(raw)
    expect(normalizeReviewMap(raw,content)).toEqual(map);expect(JSON.stringify(raw)).toBe(before)
    expect(map.totalPoints).toBe(20);expect(map.minutes).toBe(expectedMaps[subject].minutes);expect(map.questions.flatMap(question=>question.skills)).toHaveLength(expectedMaps[subject].rows);expect(map.questions.map(question=>question.questionId)).toEqual(content.quiz.questions.map(question=>question.id))
    expect(map.questions.reduce((sum,question)=>sum+question.points,0)).toBe(20)
    for(const question of map.questions){expect(question.skills.reduce((sum,skill)=>sum+skill.points,0)).toBe(question.points);for(const skill of question.skills){expect(skill.weeks.every(week=>week>=1&&week<=12)).toBe(true);for(const id of skill.sectionIds)expect(content.sections.some(section=>section.id===id)).toBe(true)}}
    const quizIds=new Set(content.quiz.questions.map(question=>question.id)),segments=content.budget.segments.filter(segment=>segment.activityIds.some(id=>quizIds.has(id)))
    expect(segments.reduce((sum,segment)=>sum+segment.minutes,0)).toBe(map.minutes)
    expect(lessonSteps(lesson).filter(step=>step.id==='quiz')).toHaveLength(1)
    const quiz=await renderStep(12,subject,'quiz');expect(quiz.match(/class="problem-card"/g)).toHaveLength(content.quiz.questions.length);expect(quiz).not.toContain('cumulative-review-map');expect(quiz).toContain('原创累计诊断')
  })
  it.each(subjects)('keeps %s skill weights and local remediation inside a default-closed review disclosure',async(subject)=>{
    const lesson=(await loadStudyWeek(12)).subjects[subject]!,map=lesson.enrichmentReviewMap!,html=await renderStep(12,subject,'review')
    const start=html.indexOf('<details class="reading-detail cumulative-review-map">'),end=html.indexOf('</details>',start),detail=html.slice(start,end)
    expect(start).toBeGreaterThan(-1);const coveredWeeks=[...new Set(map.questions.flatMap(question=>question.skills.flatMap(skill=>skill.weeks)))].sort((a,b)=>a-b);expect(coveredWeeks).toEqual(expectedMaps[subject].weeks);const range=coveredWeeks.every((week,index)=>index===0||week===coveredWeeks[index-1]!+1)?`${coveredWeeks[0]}—${coveredWeeks.at(-1)}`:coveredWeeks.join('、');expect(detail).toContain(`做完累计诊断后，查看第${range}周技能回查`);expect(detail).toContain('不代表对这些周次做了全面测评');expect(detail).toContain('每项分值只计一次');expect(html).not.toMatch(/<details[^>]*\bopen/)
    for(const question of map.questions)for(const skill of question.skills){expect(detail).toContain(escaped(skill.skill));expect(detail).toContain(`关联第 ${skill.weeks.join('、')} 周`)}
    for(const step of lessonSteps(lesson).filter(step=>step.id!=='review'))expect(await renderStep(12,subject,step.id)).not.toContain('cumulative-review-map')
    expect(detail).not.toContain('/workspace/');expect(detail).not.toContain('scoringIndex')
    expect(learningContexts(lesson,'review',12,lesson.enrichment!.subject)).toEqual([])
  })
})
