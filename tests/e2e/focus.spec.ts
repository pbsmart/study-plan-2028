import { test, expect } from '@playwright/test'
const key='xunxu.gaokao.v1'
test.beforeEach(async({page})=>{await page.goto('/');await page.evaluate(()=>localStorage.clear());await page.reload()})

test('focus mode has one lesson, closed navigation and revealable answers',async({page})=>{
  await page.goto('/#learn/13/math/knowledge');await expect(page.locator('.focus-reader')).toBeVisible();await expect(page.locator('.focus-section-title')).toBeFocused()
  await expect(page.locator('.sidebar')).toHaveCount(0);await expect(page.locator('.subject-tabs')).toHaveCount(0);await expect(page.locator('.record-section')).toHaveCount(0)
  await expect(page.locator('.focus-directory')).toHaveJSProperty('open', await page.evaluate(() => innerWidth >= 980));await expect(page.locator('.focus-source-details')).not.toHaveAttribute('open','')
  await expect(page.locator('.knowledge-block')).not.toHaveCount(0);await expect(page.locator('.problem-card')).toHaveCount(0)
  await page.getByRole('button',{name:'下一节 →',exact:true}).click();await expect(page).toHaveURL(/#learn\/13\/math\/examples$/)
  await expect(page.locator('.focus-section-title')).toBeFocused();const answer=page.locator('.focus-section .problem-card details').first();await expect(answer).not.toHaveAttribute('open','');await answer.locator('summary').click();await expect(answer).toHaveAttribute('open','')
  await page.getByRole('button',{name:'下一节 →',exact:true}).click();await expect(page.locator('.focus-section .problem-card details').first()).not.toHaveAttribute('open','')
  await page.getByRole('button',{name:'← 上一节',exact:true}).click();await expect(page.locator('.focus-section .problem-card details').first()).not.toHaveAttribute('open','')
})

test('exit, Back, Forward and refresh keep route and saved progress distinct',async({page})=>{
  await page.goto('/#learn/14/math/knowledge');await expect(page.locator('.focus-reader')).toBeVisible()
  await page.getByRole('button',{name:'下一节 →',exact:true}).click();await page.getByRole('button',{name:'← 退出专注',exact:true}).click()
  await expect(page.locator('.start-focus')).toBeFocused();await expect(page.getByLabel('浏览学习周')).toHaveValue('14');await expect(page.locator('.topbar')).toContainText('第 1 周')
  await page.goBack();await expect(page).toHaveURL(/#learn\/14\/math\/examples$/);await expect(page.locator('.focus-reader')).toBeVisible()
  await page.reload();await expect(page.locator('.focus-position')).toContainText('例题精讲');await page.goForward();await expect(page.locator('.start-focus')).toBeVisible()
  const current=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'{"currentWeek":1}').currentWeek,key);expect(current).toBe(1)
})

test('focus checkoffs persist, reverse and remain isolated from other weeks and time',async({page})=>{
  await page.goto('/#learn/13/math/knowledge');await page.locator('.focus-checkpoint input').check();await page.reload();await expect(page.locator('.focus-checkpoint input')).toBeChecked()
  await page.goto('/#learn/14/math/knowledge');await expect(page.locator('.focus-checkpoint input')).not.toBeChecked();await page.goto('/#learn/13/math/knowledge');await expect(page.locator('.focus-checkpoint input')).toBeChecked();await page.locator('.focus-checkpoint input').uncheck()
  const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);expect(stored.currentWeek).toBe(1);expect(stored.weeks['13'].sessions).toEqual([]);expect(stored.weeks['13'].completed).toEqual([])
})

test('directory and reading controls work with the keyboard',async({page})=>{
  await page.goto('/#learn/13/math/prepare');await expect(page.locator('.focus-reader')).toBeVisible();await page.locator('.skip-link').focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/#learn\/13\/math\/prepare$/);await expect(page.locator('#main')).toBeFocused();const summary=page.locator('.focus-directory > summary');await summary.focus();await page.keyboard.press('Enter');await expect(page.locator('.focus-directory')).toHaveAttribute('open','')
  await page.locator('.focus-directory button').filter({hasText:'独立练习'}).focus();await page.keyboard.press('Enter');await expect(page.locator('.focus-directory')).toHaveJSProperty('open', await page.evaluate(() => innerWidth >= 980));await expect(page.locator('.focus-section-title')).toBeFocused();await summary.click();await page.locator('.focus-directory button[aria-current=step]').click();await expect(page.locator('.focus-section-title')).toBeFocused()
  await page.locator('.focus-section .problem-card details > summary').first().focus();await page.keyboard.press('Enter');await expect(page.locator('.focus-section .problem-card details').first()).toHaveAttribute('open','')
})

test('focus layout stays readable in both themes without horizontal overflow',async({page},info)=>{
  await page.goto('/#learn/13/math/knowledge')
  for(const theme of ['深色','浅色']){
    const options=page.locator('.focus-options');if(!await options.getAttribute('open'))await options.locator('summary').click()
    await options.getByRole('button',{name:theme,exact:true}).click();await options.locator('summary').click()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    const width=await page.locator('.focus-content').evaluate(el=>el.getBoundingClientRect().width);expect(width).toBeLessThanOrEqual(760)
    await page.screenshot({path:`test-results/focus-${info.project.name}-${theme==='深色'?'dark':'light'}.png`,fullPage:true})
  }
})

test('invalid section deep links recover to lesson preparation without marking progress',async({page})=>{
  await page.goto('/#learn/13/math/not-a-section');await expect(page.locator('.focus-position')).toContainText('学习准备');await expect(page).toHaveURL(/#learn\/13\/math\/prepare$/)
  await page.goto('/#learn/85/math/prepare');await expect(page.getByRole('heading',{name:'学习概览',exact:true})).toBeVisible()
})

test('first twelve weeks of enhanced lessons expose the diagnostic, small sections, quiz and honest limits',async({page})=>{
  test.setTimeout(240000)
  for(const week of [1,2,3,4,5,6,7,8,9,10,11,12])for(const subject of ['chinese','math','english','physics','chemistry']){
    await page.goto(`/#learn/${week}/${subject}/prepare`);await expect(page.locator('.enriched-content')).toContainText(`第${week}周深化试点`)
    await page.getByRole('button',{name:'下一节 →',exact:true}).click();await expect(page.locator('.focus-section-title')).toHaveText('课前自测')
    await expect(page.locator('.focus-section .problem-card')).not.toHaveCount(0);await expect(page.locator('.focus-section details[open]')).toHaveCount(0)
    await page.getByRole('button',{name:'下一节 →',exact:true}).click();await expect(page.locator('.lesson-checkpoint-question')).toBeVisible();await expect(page.locator('.lesson-checkpoint-question details')).not.toHaveAttribute('open','')
    await page.locator('.focus-directory > summary').click();await page.locator('.focus-directory button').filter({hasText:[4,8,12].includes(week)?'20 分累计诊断':'20 分短测'}).click();await expect(page.locator('.enriched-content')).toContainText('页面不提供自动评分')
    if(subject==='english')await expect(page.locator('.focus-title')).toContainText('无音频')
  }
})

test('an active timer keeps its original subject and blocks a different-week deep link',async({page})=>{
  await page.goto('/#weekly');await page.getByRole('button',{name:'开始计时',exact:true}).click()
  await page.locator('.subject-tabs').getByRole('button',{name:'英语',exact:true}).click();await page.locator('.start-focus').click()
  await expect(page.locator('.focus-timer-status')).toContainText('数学');await expect(page.locator('.focus-title')).toContainText('英语')
  await page.evaluate(()=>{location.hash='learn/2/math/knowledge'});await expect(page.getByRole('status')).toContainText('保存或舍弃');await expect(page).toHaveURL(/#learn\/1\/english\/prepare$/)
  await page.getByRole('button',{name:'← 退出专注',exact:true}).click();await page.getByRole('button',{name:'舍弃本次计时',exact:true}).click();await expect(page.getByLabel('浏览学习周')).toBeEnabled()
})
