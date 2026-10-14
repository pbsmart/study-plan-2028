import { test, expect } from '@playwright/test'
const key='xunxu.gaokao.v1'
test.beforeEach(async({page})=>{await page.goto('/');await page.evaluate(()=>localStorage.clear());await page.reload()})

const figures=[
  ['math','w2-math-s6','w2-math-figure-interval'],
  ['chemistry','w2-chemistry-s2','w2-chemistry-figure-neutral'],
  ['chemistry','w2-chemistry-s5','w2-chemistry-figure-ions'],
  ['physics','w2-physics-s2','w2-physics-diagram-route'],
] as const

test('four original figures load in light and dark layouts with equivalent text and no page overflow',async({page},info)=>{
  for(const [subject,step,id] of figures){
    await page.goto(`/#learn/2/${subject}/${step}`)
    const figure=page.locator(`[data-figure-id="${id}"]`),image=figure.locator('img')
    await expect(image).toBeVisible();await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true)
    await expect(image).toHaveAttribute('alt',/.{20}/);await expect(figure.locator('figcaption')).not.toBeEmpty();await expect(page.locator('.focus-section svg')).toHaveCount(0)
    for(const theme of ['深色','浅色']){
      const options=page.locator('.focus-options');if(await options.getAttribute('open')===null)await options.locator('summary').click()
      await options.getByRole('button',{name:theme,exact:true}).click();await options.locator('summary').click()
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      expect(await figure.locator('.static-figure-image').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)')
      await figure.screenshot({path:`test-results/week2-${id}-${info.project.name}-${theme==='深色'?'dark':'light'}.png`})
    }
    if(info.project.name==='mobile'){
      const region=figure.getByRole('region');await region.focus();await page.keyboard.press('ArrowRight');await expect.poll(()=>region.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0)
    }
  }
})

test('figures containing results stay inside closed example answers and reset when navigating',async({page})=>{
  for(const [subject,step]of [['math','w2-math-ex4'],['chemistry','w2-chemistry-ex1'],['chemistry','w2-chemistry-ex3'],['physics','w2-physics-ex2']]){
    await page.goto(`/#learn/2/${subject}/${step}`);const disclosure=page.locator('.focus-section .problem-card > details'),figure=disclosure.locator('.static-lesson-figure')
    await expect(disclosure).not.toHaveAttribute('open','');await expect(figure).toHaveCount(1);await expect(figure).not.toBeVisible()
    await disclosure.locator('summary').click();await expect(figure).toBeVisible();await page.getByRole('button',{name:'下一节 →',exact:true}).click();await page.goBack()
    await expect(page).toHaveURL(new RegExp(`#learn/2/${subject}/${step}$`));await expect(disclosure).not.toHaveAttribute('open','');await expect(figure).not.toBeVisible()
  }
  await page.goto('/#learn/2/physics/w2-physics-ex1');await expect(page.locator('.static-lesson-figure')).toHaveCount(0)
})

test('week-two enrichment preserves progress, pending third subject, and later basic courses',async({page})=>{
  await page.goto('/#learn/2/math/prepare');await expect(page.locator('.enriched-content')).toContainText('第2周深化试点')
  await page.getByRole('button',{name:'← 退出专注',exact:true}).click();await expect(page.locator('.topbar')).toContainText('第 1 周');await expect(page.locator('.subject-tabs')).toContainText('第三科 · 待确认')
  for(const week of [5,40,84]){await page.goto(`/#learn/${week}/math/knowledge`);await expect(page.locator('.knowledge-block')).not.toHaveCount(0);await expect(page.locator('.enriched-content')).toHaveCount(0)}
  await page.goto('/#learn/1/math/prepare');await expect(page.locator('.enriched-content')).toContainText('第1周深化试点')
  const record=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),key);if(record){expect(record.currentWeek).toBe(1);expect(record.settings.thirdConfirmed).toBe(false)}
})
