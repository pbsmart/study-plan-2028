import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const courseData = JSON.parse(readFileSync(new URL('../../src/curriculum/study-plan-content-v1.json', import.meta.url), 'utf8')) as {contentCoverage:{detailedWeeks:number[];detailedLessons:number;remainingOutlineWeeks:number[]};lessons:{week:number;subject:string;diagnosticTest?:{questions:unknown[]}}[]}
const key = 'xunxu.gaokao.v1'
const legacyFixture = { version:1, firstCompleted:['first-1-0','first-4-1'], settings:{theme:'dark',third:'geography',thirdConfirmed:true,examDate:'2028-06-08',workload:'busy'}, weeks:{'2026-10-12':{workload:'normal',completed:['math-core','geography-review'],sessions:[{id:'old-session',date:'2026-10-13',subject:'math',seconds:3600,source:'manual'}]}} }
test.beforeEach(async ({page}) => { await page.goto('/'); await page.evaluate(()=>localStorage.clear()); await page.reload() })

test('six pages, 84 week outlines, responsive light and dark screenshots',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  for(const label of ['学习概览','学习路线','六科学习路径','首四周学习','学习周','设置与备份']){
    await page.getByRole('navigation').getByRole('link',{name:label}).click()
    await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    if(label==='学习路线')await expect(page.locator('.learning-week-row')).toHaveCount(84)
  }
  for(const theme of ['深色','浅色']){
    await page.getByRole('button',{name:theme,exact:true}).last().click()
    await page.getByRole('navigation').getByRole('link',{name:'学习概览'}).click()
    await page.screenshot({path:`test-results/${info.project.name}-${theme==='浅色'?'light':'dark'}.png`,fullPage:true})
    await expect(page.locator('.hero')).not.toContainText('预计考试日')
    await page.getByRole('navigation').getByRole('link',{name:'学习周'}).click()
    await page.screenshot({path:`test-results/${info.project.name}-lesson-${theme==='浅色'?'light':'dark'}.png`,fullPage:true})
    await page.getByRole('navigation').getByRole('link',{name:'设置与备份'}).click()
  }
  expect(errors).toEqual([])
})
test('browsing future weeks does not advance; only explicit manual action persists',async({page})=>{
  await page.goto('/#weekly');await page.getByLabel('浏览学习周').selectOption('3')
  await expect(page.locator('.topbar')).toContainText('第 1 周')
  await page.reload();await expect(page.getByLabel('浏览学习周')).toHaveValue('1')
  await page.getByLabel('浏览学习周').selectOption('2')
  await page.getByRole('button',{name:'手动将第 2 周设为当前学习周'}).click()
  await page.reload();await expect(page.getByLabel('浏览学习周')).toHaveValue('2')
  await expect(page.locator('.lesson-checkpoints input:checked')).toHaveCount(0)
  await expect(page.locator('.session-list li')).toHaveCount(0)
})
test('calendar time and historic log dates cannot change the learning sequence',async({page})=>{
  await page.clock.install({time:new Date('2030-11-06T12:00:00Z')})
  await page.reload();await expect(page.locator('.topbar')).toContainText('第 1 周')
  await page.goto('/#weekly');await page.getByLabel('日志日期').fill('2024-01-03');await page.getByLabel('实际分钟数').fill('40');await page.getByRole('button',{name:'确认并添加实际时长'}).click()
  await expect(page.getByLabel('浏览学习周')).toHaveValue('1');await page.reload();await expect(page.getByLabel('浏览学习周')).toHaveValue('1')
  await expect(page.locator('.session-list')).toContainText('2024-01-03')
})
test('legacy migration retains every record, old checkoff, theme and original snapshot',async({page})=>{
  await page.evaluate(({key,fixture})=>localStorage.setItem(key,JSON.stringify(fixture)),{key,fixture:legacyFixture});await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
  await expect(page.locator('.topbar')).toContainText('第 1 周')
  const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key)
  expect(stored.version).toBe(2);expect(stored.legacy.weeks).toEqual(legacyFixture.weeks);expect(stored.firstCompleted).toEqual(legacyFixture.firstCompleted);expect(stored.weeks).toEqual({})
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key+'.pre-v2')!),key)).toEqual(legacyFixture)
  await page.goto('/#settings');await page.locator('.legacy-panel summary').click();await expect(page.locator('.legacy-panel')).toContainText('3600 秒')
  await page.getByRole('navigation').getByRole('link',{name:'首四周学习'}).click();await expect(page.locator('.legacy-first')).toContainText('2 项')
})
test('checkoffs are reversible, survive refresh, and stay isolated by learning week',async({page})=>{
  await page.goto('/#weekly');const tasks=page.locator('.lesson-checkpoints input[type=checkbox]')
  await tasks.first().check();await page.reload();await expect(tasks.first()).toBeChecked()
  await page.getByLabel('浏览学习周').selectOption('2');await expect(tasks.first()).not.toBeChecked()
  await tasks.nth(1).check();await page.getByLabel('浏览学习周').selectOption('1');await expect(tasks.first()).toBeChecked();await expect(tasks.nth(1)).not.toBeChecked();await tasks.first().uncheck()
  await expect(page.locator('.weekly-summary')).toContainText('0 小时')
})
test('manual records span calendar dates and repeated clicks add only once',async({page})=>{
  await page.goto('/#weekly');await page.getByLabel('日志日期').fill('2024-01-03');await page.getByLabel('实际分钟数').fill('40');await page.getByRole('button',{name:'确认并添加实际时长'}).dblclick();await expect(page.locator('.session-list li')).toHaveCount(1)
  await page.getByLabel('日志日期').fill('2025-02-20');await page.getByLabel('实际分钟数').fill('30');await page.getByRole('button',{name:'确认并添加实际时长'}).click();await page.reload();await expect(page.locator('.session-list li')).toHaveCount(2)
  await page.getByLabel('浏览学习周').selectOption('2');await expect(page.locator('.session-list li')).toHaveCount(0)
  await page.getByLabel('日志日期').fill('2099-01-01');await page.getByLabel('实际分钟数').fill('30');await page.getByRole('button',{name:'确认并添加实际时长'}).click();await expect(page.locator('.session-list li')).toHaveCount(0)
})
test('timer requires explicit saving, is idempotent and keeps its selected learning week',async({page})=>{
  await page.goto('/#weekly');await page.getByLabel('浏览学习周').selectOption('3');await page.getByRole('button',{name:'开始计时',exact:true}).click()
  await expect(page.locator('.timer strong')).not.toHaveText('00:00:00',{timeout:4000});await page.getByRole('button',{name:'暂停计时',exact:true}).click()
  await expect(page.getByLabel('浏览学习周')).toBeDisabled();await expect(page.locator('.session-list li')).toHaveCount(0)
  await page.getByRole('button',{name:'确认学习并保存'}).dblclick();await expect(page.locator('.session-list li')).toHaveCount(1);await expect(page.getByRole('button',{name:'确认学习并保存'})).toBeDisabled()
  await page.getByLabel('浏览学习周').selectOption('1');await expect(page.locator('.session-list li')).toHaveCount(0);await expect(page.locator('.topbar')).toContainText('第 1 周')
})
test('v1 and v2 backups validate, trap focus, confirm overwrites and preserve migrated logs',async({page})=>{
  await page.goto('/#settings');const input=page.locator('input[type=file]')
  await input.setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await expect(page.getByRole('status')).toContainText('有效 JSON');await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button',{name:'导入 JSON 备份',exact:true}).focus()
  const file={name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacyFixture))}
  await input.setInputFiles(file);await expect(page.getByRole('button',{name:'取消，保留当前数据'})).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'确认覆盖并导入'})).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'取消，保留当前数据'})).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'导入 JSON 备份',exact:true})).toBeFocused()
  await input.setInputFiles(file);await page.getByRole('button',{name:'确认覆盖并导入'}).click();await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
  const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);expect(stored.version).toBe(2);expect(stored.legacy.weeks).toEqual(legacyFixture.weeks)
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出 JSON 备份'}).click();expect((await downloadPromise).suggestedFilename()).toBe('xunxu-backup-v2.json')
  await input.setInputFiles({name:'v2.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(stored))});await page.getByRole('button',{name:'确认覆盖并导入'}).click();await page.reload();expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key)).toEqual(stored)
})
test('published lessons render real content; later outline cannot fake completed content',async({page})=>{
  await page.goto('/#overview');await expect(page.getByText(`共 84 个学习周，已有 ${courseData.contentCoverage.detailedWeeks.length} 周八科内容齐全`, {exact:false})).toContainText(`${courseData.contentCoverage.detailedLessons} 个学科课次`)
  await page.goto('/#weekly');await expect(page.locator('.lesson-heading')).toContainText('完整讲解');await expect(page.locator('.knowledge-block')).not.toHaveCount(0)
  await expect(page.locator('.problem-card').first()).toContainText('原创基础例题（非高考原题）');const details=page.locator('.problem-card').first().locator('details');await expect(details).not.toHaveAttribute('open','');await details.locator('summary').click();await expect(details).toHaveAttribute('open','');await expect(details.locator('.solution')).toContainText('答案：')
  await expect(page.locator('.source-panel')).toContainText('往年真题考点参考（查看官方评析）');await expect(page.locator('.source-panel')).toContainText('2025 年 · 全国一卷');await expect(page.locator('.source-panel a').first()).toHaveAttribute('href',/zjzs\.net/)
  const outlineWeek=courseData.contentCoverage.remainingOutlineWeeks[0]
  if(outlineWeek){await page.getByLabel('浏览学习周').selectOption(String(outlineWeek));await expect(page.locator('.lesson-heading')).toContainText('仅有周纲');await expect(page.locator('.lesson-checkpoints input:enabled')).toHaveCount(0);await expect(page.locator('.problem-card')).toHaveCount(0)}
})
test('third subject switches independently between geography and politics without biology lessons',async({page})=>{
  await page.goto('/#settings');await page.getByLabel('第三科参考').selectOption('geography');await page.getByLabel('我已核对官方选科与专业要求').check();await page.goto('/#weekly');await page.locator('.subject-tabs').getByRole('button',{name:'地理',exact:true}).click();await expect(page.locator('.lesson-heading')).toContainText('地图');await expect(page.locator('.lesson-content')).not.toContainText('细胞膜')
  await page.goto('/#settings');await page.getByLabel('第三科参考').selectOption('politics');await page.goto('/#weekly');await page.locator('.subject-tabs').getByRole('button',{name:'政治',exact:true}).click();await expect(page.locator('.lesson-heading')).toContainText('生产力');await expect(page.locator('.lesson-content')).not.toContainText('细胞膜');await expect(page.locator('.source-panel')).toContainText('来源待补充')
})
test('every published subject renders knowledge, original solutions and retests',async({page})=>{
  test.setTimeout(900000)
  for(const number of courseData.contentCoverage.detailedWeeks.map(String)){
    await page.goto('/#weekly');await page.getByLabel('浏览学习周').selectOption(number)
    for(const subject of ['语文','数学','英语','物理','化学','第三科 · 待确认']){
      await page.locator('.subject-tabs').getByRole('button',{name:subject,exact:true}).click()
      await expect(page.locator('.lesson-heading')).toContainText('完整讲解')
      await expect(page.locator('.knowledge-block')).not.toHaveCount(0)
      await expect(page.locator('.lesson-content > .panel:not(.diagnostic-panel) .problem-card')).toHaveCount(4)
      await expect(page.locator('.lesson-checkpoints input:enabled')).toHaveCount(4)
    }
    for(const [key,label] of [['geography','地理'],['politics','政治']]){
      await page.goto('/#settings');await page.getByLabel('第三科参考').selectOption(key!);await page.getByLabel('我已核对官方选科与专业要求').check();await page.goto('/#weekly');await page.getByLabel('浏览学习周').selectOption(number);await page.locator('.subject-tabs').getByRole('button',{name:label!,exact:true}).click();await expect(page.locator('.lesson-heading')).toContainText('完整讲解');await expect(page.locator('.lesson-content > .panel:not(.diagnostic-panel) .problem-card')).toHaveCount(4)
    }
    await page.goto('/#settings');await page.getByLabel('第三科参考').selectOption('biology');await page.getByLabel('我已核对官方选科与专业要求').uncheck()
  }
})
test('overview always describes current manual progress when another week is browsed',async({page})=>{
  await page.goto('/#weekly');await page.getByLabel('实际分钟数').fill('60');await page.getByRole('button',{name:'确认并添加实际时长'}).click();await page.getByLabel('浏览学习周').selectOption('2');await page.getByLabel('实际分钟数').fill('120');await page.getByRole('button',{name:'确认并添加实际时长'}).click();await page.goto('/#overview');await expect(page.locator('.stat').first()).toContainText('1 小时');await expect(page.locator('.learning-progress strong')).toContainText('1')
})
test('light and dark text meet AA contrast',async({page})=>{
  await page.goto('/#settings')
  for(const theme of ['浅色','深色']){
    await page.getByRole('button',{name:theme,exact:true}).last().click()
    const ratios=await page.evaluate(()=>{
      const root=getComputedStyle(document.documentElement)
      const rgb=(color:string)=>{const el=document.createElement('div');el.style.color=color;document.body.append(el);const value=getComputedStyle(el).color.match(/[\d.]+/g)!.map(Number).slice(0,3);el.remove();return value}
      const lum=(color:number[])=>color.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i]!,0)
      return ['--surface','--soft','--bg'].flatMap(bg=>['--text','--muted'].map(fg=>{const a=lum(rgb(root.getPropertyValue(fg))),b=lum(rgb(root.getPropertyValue(bg)));return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}))
    });for(const ratio of ratios)expect(ratio).toBeGreaterThanOrEqual(4.5)
  }
})
