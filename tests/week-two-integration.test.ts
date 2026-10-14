import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { mkdtemp, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { loadStudyWeek } from '../src/curriculum'
import { readCurriculumData } from '../src/curriculum/vite-plugin'
import { lessonSteps } from '../src/focus'
import FocusLesson from '../src/components/FocusLesson.vue'
import { defaultData, parseBackup } from '../src/model'
import type { SubjectId } from '../src/model'

const source = (path:string) => new URL(`../src/curriculum/enriched-week-02/${path}`,import.meta.url)
const renderStep = async(subject:SubjectId,step:string,completed:string[]=[]) => {
  const week=await loadStudyWeek(2),lesson=week.subjects[subject]!
  return renderToString(createSSRApp(FocusLesson,{week:2,subject,subjectLabel:lesson.enrichment!.subject,lesson,completed,step}))
}

describe('week-two frozen content and static figure integration',()=>{
  it('preserves all five author-frozen lesson files and four original SVGs byte-for-byte',async()=>{
    const hashes:Record<string,string>={
      'chinese.json':'a346afcd5fdb9f5b160834bf9d84bf1304c480eeb399dc49c12444dfc0b8d418',
      'math.json':'9ab0f1bf26cc2191cb97cbc76c2f22ceb33d0e2955bf0ae2f4bf0b2fbf737421',
      'english.json':'eb93ed72e1c3a65f64148bfc139d7b409674bb880f7208e3596d639d5f260b96',
      'physics.json':'f8cc3d159d1b632eb54de5811f55d6fe570c81f32d5f72b5f4561993ebf47292',
      'chemistry.json':'5b533b1a8e262fa5988d14b2c5c467ef9f9e93d7c1b7100d5e02ee0376cbbb20',
      'assets/math-inequality-intersection.svg':'a646813db00bea1a3c01b709385947c121ab84eb6087e6fd4e13a1fa818d8453',
      'assets/chemistry-neutral-counts.svg':'99f5092132218e24b420ab5e892362e696cd27d4df4330fb2ffa7e6a74f443a6',
      'assets/chemistry-ion-counts.svg':'bad28eabe3eae1c84d523fe536effa7be9c76e136cd6bc9ad8d4aa5b4b5da7c2',
      'assets/physics-route.svg':'8d859911d4d1bb85f677db21e7e2ee00f1109972f82136f970783d6970ed5d5b',
    }
    for(const [path,hash]of Object.entries(hashes))expect(createHash('sha256').update(await readFile(source(path))).digest('hex')).toBe(hash)
  })
  it('attaches four static figures only to their designated week and subject',async()=>{
    const first=await loadStudyWeek(1),second=await loadStudyWeek(2)
    expect(Object.values(first.subjects).every(lesson=>!lesson?.enrichmentFigures)).toBe(true)
    expect(second.subjects.math!.enrichmentFigures).toHaveLength(1);expect(second.subjects.chemistry!.enrichmentFigures).toHaveLength(2);expect(second.subjects.physics!.enrichmentFigures).toHaveLength(1)
    expect(second.subjects.chinese!.enrichmentFigures).toBeUndefined();expect(second.subjects.english!.enrichmentFigures).toBeUndefined()
    for(const lesson of Object.values(second.subjects))for(const figure of lesson?.enrichmentFigures||[]){expect(figure.src).toContain('.svg');expect(figure.altText.length).toBeGreaterThan(20);expect(figure.width).toBeGreaterThan(0);expect(figure.height).toBeGreaterThan(0)}
  })
  it('uses original SVGs with equivalent text and does not misdraw mathematical or particle diagrams',async()=>{
    const math=await renderStep('math','w2-math-s6');expect(math).toContain('math-inequality-intersection.svg');expect(math).toContain('−2空心、5实心');expect(math).toContain('可左右滚动查看');expect(math).not.toContain('<svg')
    const chemistry=await renderStep('chemistry','w2-chemistry-s5');expect(chemistry).toContain('chemistry-ion-counts.svg');expect(chemistry).toContain('不表示电子固定轨道');expect(chemistry).not.toContain('<svg')
    const physics=await renderStep('physics','w2-physics-s2');expect(physics).toContain('physics-route.svg');expect(physics.match(/data-figure-id=/g)).toHaveLength(1);expect(physics).not.toContain('<svg');expect(physics).toContain('总时间9 s')
  })
  it.each([['math','w2-math-ex4'],['chemistry','w2-chemistry-ex1'],['chemistry','w2-chemistry-ex3'],['physics','w2-physics-ex2']] as const)('keeps the solution figure closed for %s %s',async(subject,step)=>{
    const html=await renderStep(subject,step),details=html.indexOf('<details class="problem-answer"><summary>展开例题解析</summary>'),figure=html.indexOf('data-figure-id=')
    expect(details).toBeGreaterThan(-1);expect(figure).toBeGreaterThan(details);expect(figure).toBeLessThan(html.indexOf('</details>',details));expect(html).not.toMatch(/<details[^>]*\bopen/)
  })
  it('does not show the round-trip answer diagram for the outbound-only physics example',async()=>{
    expect(await renderStep('physics','w2-physics-ex1')).not.toContain('data-figure-id=')
  })
  it('preserves old week-two check-ins without marking the new lesson as mastered',async()=>{
    const week=await loadStudyWeek(2),step=lessonSteps(week.subjects.math).find(step=>step.checkpoint==='knowledge')!
    const record=defaultData();record.weeks['2']={workload:'normal',completed:['w2-math-knowledge'],sessions:[]}
    expect(parseBackup(JSON.stringify(record))).toEqual(record)
    const html=await renderStep('math',step.id,record.weeks['2'].completed);expect(html).toContain('checked');expect(html).toContain('不代表深化内容已完成');expect(record.currentWeek).toBe(1);expect(record.settings.thirdConfirmed).toBe(false)
  })
  it('registers only actual source files for Vite development import analysis',async()=>{
    const data=await readCurriculumData();expect(data.sourceFiles.some(path=>path.endsWith('math-inequality-intersection.svg'))).toBe(true)
    for(const path of data.sourceFiles)expect((await stat(path)).isFile()).toBe(true)
  })
})

describe('configurable enrichment validation',()=>{
  it('uses explicitly configured week and revision without hardcoding week one',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'study-week-config-'))
    try{
      const lesson=JSON.parse(await readFile(source('math.json'),'utf8'));await writeFile(join(directory,'math.json'),JSON.stringify(lesson))
      const config={week:2,revision:'week02-enriched-v1',directory}
      const data=await readCurriculumData({enrichments:[config]});expect(data.weeks[1]!.subjects.math!.enrichment?.week).toBe(2);expect(data.weeks[0]!.subjects.math!.enrichment).toBeUndefined()
      await expect(readCurriculumData({enrichments:[config,config]})).rejects.toThrow('配置无效或重复')
      await expect(readCurriculumData({enrichments:[{...config,week:3}]})).rejects.toThrow('第3周深化文件无效')
      await expect(readCurriculumData({enrichments:[{...config,revision:'wrong'}]})).rejects.toThrow('深化文件无效')
    }finally{await rm(directory,{recursive:true,force:true})}
  })
  it('rejects missing associations, external/path-traversal assets and active SVG content',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'study-figure-validation-'))
    try{
      await mkdir(join(directory,'assets'));await writeFile(join(directory,'math.json'),await readFile(source('math.json')))
      const figure=JSON.parse(await readFile(source('assets/math-inequality-intersection.json'),'utf8'))
      const config={week:2,revision:'week02-enriched-v1',directory,figureManifests:[{subject:'math',file:'assets/figures.json'}]}
      const write=async(value:unknown)=>writeFile(join(directory,'assets/figures.json'),JSON.stringify(value))
      await write({...figure,linkedSectionIds:['missing']});await expect(readCurriculumData({enrichments:[config]})).rejects.toThrow('不存在的小节')
      for(const asset of ['../escape.svg','https://example.com/figure.svg']){await write({...figure,asset});await expect(readCurriculumData({enrichments:[config]})).rejects.toThrow('包内 assets/')}
      await write(figure);await writeFile(join(directory,figure.asset),'<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>');await expect(readCurriculumData({enrichments:[config]})).rejects.toThrow('活动内容')
      await writeFile(join(directory,figure.asset),'<svg viewBox="0 0 1.2.3 10"></svg>');await expect(readCurriculumData({enrichments:[config]})).rejects.toThrow('有效viewBox')
    }finally{await rm(directory,{recursive:true,force:true})}
  })
})
