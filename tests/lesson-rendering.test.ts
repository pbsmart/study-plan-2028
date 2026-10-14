import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import WeekLesson from '../src/components/WeekLesson.vue'
import OriginalProblem from '../src/components/OriginalProblem.vue'
import { curriculum as curriculumIndex, loadStudyWeek } from '../src/curriculum'
import { adaptCurriculum } from '../src/curriculum/adapter'
import type { SubjectId } from '../src/model'

const curriculum = await Promise.all(curriculumIndex.map(week => loadStudyWeek(week.week)))

const renderLesson = (week:number,subject:SubjectId) => renderToString(createSSRApp(WeekLesson,{week,subject,lesson:curriculum.find(w=>w.week===week)!.subjects[subject],completed:[]}))
describe('complete teaching content rendering',()=>{
  it('renders every diagnostic question, scoring rubric and remediation entry',async()=>{
    for(const w of curriculum) for(const [subject,l] of Object.entries(w.subjects)) if(l?.diagnosticTest){
      const html=await renderLesson(w.week,subject as SubjectId)
      expect(html).toContain('diagnostic-panel');expect(html).toContain(`${l.diagnosticTest.totalPoints} 分`)
      expect(html.match(/诊断完成后查看答案与逐点评分/g)).toHaveLength(l.diagnosticTest.questions.length)
      expect(html.match(/逐点评分（自行核对）/g)).toHaveLength(l.diagnosticTest.questions.length)
      for(const q of l.diagnosticTest.questions) expect(html).toContain(`class="problem-id">${q.id} · </span>`)
      for(const entry of l.diagnosticTest.remediationMap) expect(html).toContain(entry.questionId)
      expect(html).not.toContain('[object Object]')
    }
  })
  it('shows text-only listening limits and never invents audio playback or listening completion',async()=>{
    const lessons=curriculum.flatMap(w=>Object.entries(w.subjects).filter(([,l])=>!!l?.audioStatus).map(([subject])=>[w.week,subject] as const))
    expect(lessons.length).toBeGreaterThan(0)
    for(const [week,subject] of lessons){const html=await renderLesson(week,subject as SubjectId);expect(html).toContain('听力文字预训练 · 非音频');expect(html).toContain('真实听辨仍待验证');expect(html).not.toContain('<audio');expect(html).not.toContain('听力已完成')}
  })
  it('preserves context, starter sentences, counts and rubrics without repeating an embedded story or sample',async()=>{
    const raw={weeks:[{week:1,subjects:{英语:{topic:'写作'}}}],lessons:[{week:1,subject:'英语',workedExample:{sourceType:'original',question:'Read: Original story. Continue it.',sourceStory:'Original story.',paragraphStarters:['The next morning,','After the meeting,'],answer:'The complete sample.',sampleContinuation:'The complete sample.',sampleWordCount:150,wordCountNote:'首句计入。',wordRange:[140,160],explanation:'Check the evidence.',points:10,scoring:[{points:10,criterion:'Coherent paragraphs.'}]}}]}
    const problem=adaptCurriculum(raw)[0]!.subjects.english!.examples[0]!
    const html=await renderToString(createSSRApp(OriginalProblem,{problem,label:'原创',revealLabel:'查看答案'}))
    expect(html.split('Original story.')).toHaveLength(2);expect(html.split('The complete sample.')).toHaveLength(2)
    expect(html).toContain('The next morning,');expect(html).toContain('After the meeting,');expect(html).toContain('150 词');expect(html).toContain('140–160');expect(html).toContain('首句计入。');expect(html).toContain('Coherent paragraphs.')
  })
  it('shows final-course mastery boundaries and public-domain metadata without treating IDs as links',async()=>{
    const raw={verificationReferences:[{id:'poem-ref',title:'原典核验',url:'https://example.org/poem',verifiedFor:'作者篇名核验'}],weeks:[{week:84,subjects:{语文:{topic:'末次诊断'}}}],lessons:[{week:84,subject:'语文',sources:['poem-ref'],trainingScope:'缩短型诊断，非整卷。',masteryStatus:'待独立作答。',writingMasteryStatus:'完整作文另测。',pendingChecklist:['另行完成独立长文。'],workedExample:{sourceType:'original',question:'公版诗句。回答问题。',answer:'教学解析。',explanation:'据原文作答。',characterCountNote:'只计汉字。',quotedSource:{title:'古诗',author:'作者',copyrightStatus:'public_domain',referenceId:'poem-ref',text:'公版诗句。'},sources:['poem-ref','javascript:alert(1)','https://example.org/poem']}}]}
    const lesson=adaptCurriculum(raw)[0]!.subjects.chinese!
    const html=await renderToString(createSSRApp(WeekLesson,{week:84,subject:'chinese',lesson,completed:[]}))
    for(const text of ['缩短型诊断，非整卷。','待独立作答。','完整作文另测。','另行完成独立长文。','公版引文（原典非本课原创）','只计汉字。','原典核验'])expect(html).toContain(text)
    expect(html.split('公版诗句。')).toHaveLength(2);expect(html).not.toContain('href="poem-ref"');expect(html).not.toContain('javascript:');expect(html).not.toContain('checked')
  })
  it('renders actual writing metadata and public-domain attribution',async()=>{
    const html=await renderLesson(60,'chinese');expect(html).toContain('材料与使用边界');expect(html).toContain('原典与知识核验资料');expect(html).toContain('不是历年真题来源');expect(html).toContain('参考段汉字数：112 字')
    const writing=await renderLesson(72,'english');expect(writing).toContain('范文参考词数');expect(writing).toContain('原文参考词数');expect(writing).not.toContain('[object Object]')
  })
})
