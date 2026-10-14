import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { curriculum, loadStudyWeek } from '../src/curriculum'
import { lessonSteps } from '../src/focus'
import FocusLesson from '../src/components/FocusLesson.vue'
import WeekLesson from '../src/components/WeekLesson.vue'
import type { SubjectId } from '../src/model'

describe('complete curriculum and enriched pilot rendering',()=>{
  it('renders every original lesson without changing question count or provenance',async()=>{
    let count=0
    for(const summary of curriculum){const week=await loadStudyWeek(summary.week);for(const [subject,lesson] of Object.entries(week.subjects)){
      const html=await renderToString(createSSRApp(WeekLesson,{week:week.week,subject:subject as SubjectId,lesson,completed:[]}))
      expect(html).toContain('知识讲解');expect(html).toContain('复测与掌握标准');expect(html).toContain('原创基础例题（非高考原题）')
      expect(html.match(/class="problem-card"/g)?.length).toBe(lesson!.examples.length+lesson!.exercises.length+(lesson!.retest.problem?1:0)+(lesson!.diagnosticTest?.questions.length||0))
      expect(html).not.toContain('[object Object]');count++
    }}expect(count).toBe(672)
  })
  it('validates all five overlays and keeps the third subject and later weeks unmodified',async()=>{
    const week=await loadStudyWeek(1);let minutes=0
    for(const subject of ['chinese','math','english','physics','chemistry'] as const){
      const content=week.subjects[subject]!.enrichment!;expect(content.week).toBe(1);expect(content.revision).toBe('week01-enriched-v1');expect(content.status).toBe('pilot-ready')
      const questions=[...content.diagnostic.questions,...content.workedExamples,...content.practice,...content.quiz.questions]
      const activities=[...content.sections.map(item=>item.id),...questions.map(item=>item.id),...(content.reviewActivity?[content.reviewActivity.id]:[])]
      expect(new Set(activities).size).toBe(activities.length)
      for(const question of questions){expect(question.origin).toBe('original');expect(question.prompt.trim()).not.toBe('');expect(question.answer.trim()).not.toBe('');expect(question.steps.length).toBeGreaterThan(0)}
      for(const section of content.sections){expect(section.paragraphs.length).toBeGreaterThan(0);for(const text of Object.values(section.checkpoint))expect(text.trim()).not.toBe('')}
      expect(content.budget.segments.reduce((sum,segment)=>sum+segment.minutes,0)).toBe(content.budget.coreMinutes)
      for(const segment of content.budget.segments)for(const id of segment.activityIds)expect(activities).toContain(id)
      const sectionIds=content.sections.map(section=>section.id)
      for(const route of [...content.diagnostic.routes,...content.quiz.remediation])for(const id of route.sectionIds)expect(sectionIds).toContain(id)
      expect(content.quiz.questions.reduce((sum,question)=>sum+(question.points||0),0)).toBe(content.quiz.totalPoints)
      for(const question of content.quiz.questions)expect(question.scoring!.reduce((sum,point)=>sum+point.points,0)).toBe(question.points)
      for(const source of content.sourcePolicy.externalSources)expect(source.url).toMatch(/^https:\/\//)
      minutes+=content.budget.coreMinutes
    }
    expect(minutes).toBe(870)
    for(const subject of ['biology','geography','politics'] as const)expect(week.subjects[subject]?.enrichment).toBeUndefined()
    expect(week.subjects.english!.enrichment!.audioStatus).toContain('音频')
    for(const summary of curriculum.filter(item=>item.week!==1)){const later=await loadStudyWeek(summary.week);for(const lesson of Object.values(later.subjects))expect(lesson?.enrichment).toBeUndefined()}
  })
  it('renders every enriched step, all questions and diagnostic routes without silently losing fields',async()=>{
    const week=await loadStudyWeek(1),enriched=Object.entries(week.subjects).filter(([,lesson])=>lesson?.enrichment)
    expect(enriched.map(([subject])=>subject).sort()).toEqual(['chemistry','chinese','english','math','physics'])
    for(const [subject,lesson] of enriched){const content=lesson!.enrichment!,steps=lessonSteps(lesson),htmlByStep:Record<string,string>={}
      expect(new Set(steps.map(step=>step.id)).size).toBe(steps.length)
      for(const step of steps){const html=await renderToString(createSSRApp(FocusLesson,{week:1,subject:subject as SubjectId,subjectLabel:content.subject,lesson,completed:[],step:step.id}));htmlByStep[step.id]=html;expect(html).not.toContain('[object Object]');expect(html).not.toMatch(/<details[^>]*\bopen/)}
      const all=Object.values(htmlByStep).join('\n')
      for(const section of content.sections){expect(htmlByStep[section.id]).toContain(section.title);expect(htmlByStep[section.id]).toContain('停一停，自己试着说清楚')}
      for(const question of [...content.workedExamples,...content.practice])expect(htmlByStep[question.id]).toContain(question.title.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'))
      expect(htmlByStep.quiz?.match(/逐点评分（自行核对）/g)).toHaveLength(content.quiz.questions.length)
      expect(htmlByStep.diagnostic?.match(/做完后核对答案与解析/g)).toHaveLength(content.diagnostic.questions.length)
      expect(all).toContain(content.sourcePolicy.examStatus.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'))
      for(const diagram of content.diagrams||[])expect(all).toContain(diagram.altText)
      expect(htmlByStep.review).toContain('没有自动评分、自动达标或自动跳周')
    }
  })
})
