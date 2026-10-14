import { describe, expect, it } from 'vitest'
import { readFile, stat, mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { loadStudyWeek } from '../src/curriculum'
import { readCurriculumData } from '../src/curriculum/vite-plugin'
import { normalizeReviewMap } from '../src/curriculum/review-map'
import { lessonSteps } from '../src/focus'
import { defaultData, parseBackup } from '../src/model'
import type { SubjectId } from '../src/model'
import FocusLesson from '../src/components/FocusLesson.vue'
import integrity from './fixtures/weeks-three-four-integrity.json'
const subjects = ['chinese','math','english','physics','chemistry'] as const
const source = (path:string) => new URL(`../src/curriculum/${path}`,import.meta.url)
const mapSource = (subject:string) => source(`enriched-week-04/assets/${subject}-review-map.json`)
const renderStep = async(weekNumber:number,subject:SubjectId,step:string,completed:string[]=[]) => {
  const week=await loadStudyWeek(weekNumber),lesson=week.subjects[subject]!
  return renderToString(createSSRApp(FocusLesson,{week:weekNumber,subject,subjectLabel:lesson.enrichment!.subject,lesson,completed,step}))
}
const escaped = (text:string) => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')

describe('frozen weeks three and four integration',()=>{
  it('keeps all ten lessons, thirteen SVGs, sidecars and five review maps author-identical',async()=>{
    expect(integrity.filter(file=>file.path.endsWith('.svg'))).toHaveLength(13)
    expect(integrity.filter(file=>file.path.endsWith('-review-map.json'))).toHaveLength(5)
    expect(integrity).toHaveLength(35)
    for(const file of integrity){const bytes=await readFile(source(file.path));expect(bytes.length,file.path).toBe(file.bytes);expect(createHash('sha256').update(bytes).digest('hex'),file.path).toBe(file.sha256)}
  })
  it.each([3,4])('uses week %i static figures at intended locations with equivalent text and closed question solutions',async(weekNumber)=>{
    const week=await loadStudyWeek(weekNumber),allFigures=Object.values(week.subjects).flatMap(lesson=>lesson?.enrichmentFigures||[])
    expect(allFigures).toHaveLength(weekNumber===3?6:7)
    for(const subject of subjects){const lesson=week.subjects[subject]!
      for(const figure of lesson.enrichmentFigures||[]){
        expect(figure.src).toContain('.svg');expect(figure.altText.length).toBeGreaterThan(20)
        for(const step of figure.linkedSectionIds){const html=await renderStep(weekNumber,subject,step)
          if(figure.answerOnly){expect(html).not.toContain(`data-figure-id="${figure.id}"`);expect(html).not.toContain(escaped(figure.altText))}
          else {expect(html).toContain(`data-figure-id="${figure.id}"`);expect(html).toContain(escaped(figure.altText));expect(html).not.toContain('<svg')}
        }
        for(const id of figure.linkedQuestionIds){const step=lesson.enrichment!.quiz.questions.some(question=>question.id===id)?'quiz':id,html=await renderStep(weekNumber,subject,step),position=html.indexOf(`data-figure-id="${figure.id}"`)
          expect(position).toBeGreaterThan(-1);const opening=html.lastIndexOf('<details',position);expect(opening).toBeGreaterThan(-1);expect(html.indexOf('</details>',opening)).toBeGreaterThan(position);expect(html).not.toMatch(/<details[^>]*\bopen/)
        }
      }
    }
  })
  it('never shows the interval-example answer image or alt text in the week-three explanation',async()=>{
    const lesson=(await loadStudyWeek(3)).subjects.math!,figure=lesson.enrichmentFigures![0]!
    expect(figure.answerOnly).toBe(true)
    const section=await renderStep(3,'math','w3-math-s6'),example=await renderStep(3,'math','w3-math-ex4')
    expect(section).not.toContain('data-figure-id=');expect(section).not.toContain(escaped(figure.altText));expect(example).toContain(escaped(figure.altText))
  })
  it.each([3,4])('preserves week %i check-ins, budgets and unconfirmed third-subject state',async(weekNumber)=>{
    const week=await loadStudyWeek(weekNumber),record=defaultData();record.weeks[String(weekNumber)]={workload:'normal',completed:[`w${weekNumber}-math-knowledge`],sessions:[]}
    expect(parseBackup(JSON.stringify(record))).toEqual(record)
    const step=lessonSteps(week.subjects.math).find(step=>step.checkpoint==='knowledge')!
    expect(await renderStep(weekNumber,'math',step.id,record.weeks[String(weekNumber)]!.completed)).toContain('不代表深化内容已完成')
    expect(record.currentWeek).toBe(1);expect(record.settings.thirdConfirmed).toBe(false)
    expect(subjects.reduce((sum,subject)=>sum+week.subjects[subject]!.enrichment!.budget.coreMinutes,0)).toBe(870)
    for(const subject of ['biology','geography','politics'] as const){expect(week.subjects[subject]?.enrichment).toBeUndefined();expect(week.subjects[subject]?.enrichmentReviewMap).toBeUndefined()}
  })
  it('watches all actual review-map and figure files and only places mappings in week four',async()=>{
    const data=await readCurriculumData()
    expect(data.sourceFiles.filter(file=>file.endsWith('-review-map.json'))).toHaveLength(10)
    expect(data.sourceFiles.filter(file=>file.endsWith('.svg'))).toHaveLength(57)
    for(const file of data.sourceFiles)expect((await stat(file)).isFile()).toBe(true)
    for(const week of data.weeks)for(const lesson of Object.values(week.subjects))if(![4,8].includes(week.week))expect(lesson?.enrichmentReviewMap).toBeUndefined()
  })
})

describe('single cumulative assessment and validated review-only maps',()=>{
  it.each(subjects)('normalizes %s without inventing scores, extra questions, time or rubric indices',async(subject)=>{
    const lesson=(await loadStudyWeek(4)).subjects[subject]!,content=lesson.enrichment!,map=lesson.enrichmentReviewMap!,raw=JSON.parse(await readFile(mapSource(subject),'utf8')),before=JSON.stringify(raw)
    expect(normalizeReviewMap(raw,content)).toEqual(map);expect(JSON.stringify(raw)).toBe(before)
    expect(map.totalPoints).toBe(20);expect(map.questions).toHaveLength(4)
    expect(map.questions.map(question=>question.questionId)).toEqual(content.quiz.questions.map(question=>question.id))
    expect(map.questions.reduce((sum,question)=>sum+question.points,0)).toBe(20)
    for(const question of map.questions){expect(question.skills.reduce((sum,skill)=>sum+skill.points,0)).toBe(question.points);for(const skill of question.skills){expect(skill.weeks.every(week=>[1,2,3,4].includes(week))).toBe(true);for(const id of skill.sectionIds)expect(content.sections.some(section=>section.id===id)).toBe(true)}}
    expect(lessonSteps(lesson).filter(step=>step.id==='quiz')).toEqual([{id:'quiz',title:'20 分累计诊断'}])
    expect(lessonSteps(lesson).some(step=>step.id==='retest')).toBe(false)
    const html=await renderStep(4,subject,'quiz');expect(html.match(/class="problem-card"/g)).toHaveLength(4);expect(html).not.toContain('cumulative-review-map')
    expect(content.budget.segments.reduce((sum,segment)=>sum+segment.minutes,0)).toBe(content.budget.coreMinutes)
  })
  it.each(subjects)('shows %s skill mapping only inside closed post-answer review disclosure',async(subject)=>{
    const lesson=(await loadStudyWeek(4)).subjects[subject]!,map=lesson.enrichmentReviewMap!,html=await renderStep(4,subject,'review')
    const start=html.indexOf('<details class="reading-detail cumulative-review-map">'),end=html.indexOf('</details>',start),detail=html.slice(start,end)
    expect(start).toBeGreaterThan(-1);expect(detail).toContain('做完累计诊断后，查看第1—4周技能回查');expect(detail).toContain('每项分值只计一次');expect(html).not.toMatch(/<details[^>]*\bopen/)
    for(const question of map.questions)for(const skill of question.skills){expect(detail).toContain(escaped(skill.skill));expect(detail).toContain(`关联第 ${skill.weeks.join('、')} 周`)}
    for(const step of lessonSteps(lesson).filter(step=>step.id!=='review'))expect(await renderStep(4,subject,step.id)).not.toContain('cumulative-review-map')
    expect(detail).not.toContain('evidenceFile');expect(detail).not.toContain('scoringIndex');expect(detail).not.toContain('/workspace/')
  })
  it.each(subjects)('rejects %s wrong totals, rubric/section/week mapping, missing questions and extra minutes',async(subject)=>{
    const lesson=(await loadStudyWeek(4)).subjects[subject]!.enrichment!,raw=JSON.parse(await readFile(mapSource(subject),'utf8'))
    const alter=(mutate:(value:any)=>void)=>{const value=structuredClone(raw);mutate(value);expect(()=>normalizeReviewMap(value,lesson)).toThrow('累计诊断映射')}
    alter(value=>{value.week=3});alter(value=>{value.totalPoints=21});alter(value=>{value.minutes=99})
    alter(value=>{(value.questions||value.scoringMap).pop()})
    const row=(value:any)=>value.questions?.[0].scoringPointMap[0]||(subject==='physics'?value.scoringMap[0]:value.scoringMap[0].skills[0])
    alter(value=>{row(value).points=0});alter(value=>{row(value).remediationSectionIds=['missing']})
    alter(value=>{const item=row(value);if(subject==='chemistry')item.primaryWeek=5;else item.weeks=[5]})
    if(subject!=='math'){alter(value=>{row(value).scoringIndex=99});alter(value=>{row(value).criterion='wrong answer'})}
  })
  it('rejects duplicate and external review-map registrations before including them in a lazy chunk',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'study-review-config-'))
    try{
      await mkdir(join(directory,'assets'));await writeFile(join(directory,'math.json'),await readFile(source('enriched-week-04/math.json')));await writeFile(join(directory,'assets/math-review-map.json'),await readFile(mapSource('math')))
      const config={week:4,revision:'week04-enriched-v1',directory,reviewMapManifests:[{subject:'math',file:'assets/math-review-map.json'}]}
      await expect(readCurriculumData({enrichments:[config]})).resolves.toHaveProperty('weeks')
      await expect(readCurriculumData({enrichments:[{...config,reviewMapManifests:[...config.reviewMapManifests,...config.reviewMapManifests]}]})).rejects.toThrow('缺少课程或重复')
      await expect(readCurriculumData({enrichments:[{...config,reviewMapManifests:[{subject:'math',file:'../outside.json'}]}]})).rejects.toThrow('包内 assets/')
    }finally{await rm(directory,{recursive:true,force:true})}
  })
})
