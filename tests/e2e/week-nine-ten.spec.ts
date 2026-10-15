import { selectQuestionFor } from './ui-audit'
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { EnrichedLesson } from '../../src/curriculum/enriched-types'

const key = 'xunxu.gaokao.v1'
const readJson = <T>(week: number, path: string): T => JSON.parse(readFileSync(new URL(`../../src/curriculum/enriched-week-${String(week).padStart(2, '0')}/${path}`, import.meta.url), 'utf8'))
const lessonFor = (week: number, subject: string) => readJson<EnrichedLesson>(week, `${subject}.json`)
interface Figure { id: string; title: string; altText: string; description: string; linkedSectionIds: string[]; linkedQuestionIds: string[] }
const figures = [9, 10].flatMap(week => ['math', 'physics', 'chemistry'].flatMap(subject => readJson<Figure[]>(week, `assets/${subject}-figures.json`).map(figure => ({ ...figure, week, subject }))))
async function expectProgressUnchanged(page: Page) {
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{"currentWeek":1,"weeks":{}}'), key)
  expect(saved.currentWeek).toBe(1)
  for (const week of Object.values(saved.weeks || {}) as { sessions: unknown[]; completed: unknown[] }[]) {
    expect(week.sessions).toEqual([])
    expect(week.completed).toEqual([])
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

for (const fixture of figures) {
  test(`week ${fixture.week} ${fixture.id} loads in both themes with mobile keyboard scrolling and equivalent text`, async ({ page }, info) => {
    const lesson = lessonFor(fixture.week, fixture.subject)
    const questionId = fixture.linkedQuestionIds[0]
    const step = questionId ? (lesson.quiz.questions.some(question => question.id === questionId) ? 'quiz' : questionId) : fixture.linkedSectionIds[0]!
    await page.goto(`/#learn/${fixture.week}/${fixture.subject}/${step}`)
    await expect(page.locator('.focus-section')).toHaveAttribute('aria-labelledby', `focus-step-${step}`)
    const figure = page.locator(`[data-figure-id="${fixture.id}"]`)
    await expect(figure).toHaveCount(1)
    if (questionId) {
      const disclosure = page.locator('.focus-section .problem-card > details').filter({ has: figure })
      await expect(disclosure).not.toHaveAttribute('open', '')
      await expect(figure).not.toBeVisible()
      await selectQuestionFor(page, disclosure); await disclosure.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(disclosure).toHaveAttribute('open', '')
    }
    const image = figure.locator('img')
    // Lazy images below a long lesson are visible in layout but load only near the viewport.
    await figure.scrollIntoViewIfNeeded()
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
    await expect(image).toHaveAttribute('alt', fixture.altText)
    await expect(image).toHaveAttribute('src', /\.svg(?:\?|$)/)
    await expect(image).not.toHaveAttribute('src', /\/workspace\//)
    await expect(figure.locator('figcaption')).toContainText(fixture.description)
    await expect(figure.getByRole('link', { name: '查看原图 ↗' })).toHaveAttribute('href', (await image.getAttribute('src'))!)
    await expect(page.locator('.focus-section svg')).toHaveCount(0)
    for (const theme of ['深色', '浅色']) {
      const options = page.locator('.focus-options')
      if (await options.getAttribute('open') === null) await options.locator('summary').click()
      await options.getByRole('button', { name: theme, exact: true }).click()
      await options.locator('summary').click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(await figure.locator('.static-figure-image').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)')
      await figure.screenshot({ path: `test-results/week${fixture.week}-${fixture.id}-${info.project.name}-${theme === '深色' ? 'dark' : 'light'}.png` })
    }
    if (info.project.name === 'mobile') {
      const region = figure.getByRole('region')
      await region.focus()
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await expectProgressUnchanged(page)
  })
}


for (const fixture of [{ week: 9, questions: ['w9-physics-ex4', 'w9-physics-ex5'] }, { week: 10, questions: ['w10-physics-ex3'] }]) {
  test(`week ${fixture.week} answer diagram is exclusive to its associated examples and resets after leaving`, async ({ page }) => {
    test.setTimeout(120000)
    const lesson = lessonFor(fixture.week, 'physics'), id = `w${fixture.week}-physics-figure3`
    for (const step of ['prepare', 'diagnostic', ...lesson.sections.map(section => section.id), ...lesson.workedExamples.filter(question => !fixture.questions.includes(question.id)).map(question => question.id), ...lesson.practice.map(question => question.id), 'quiz', 'review']) {
      await page.goto(`/#learn/${fixture.week}/physics/${step}`)
      await expect(page.locator('.focus-section')).toHaveAttribute('aria-labelledby', `focus-step-${step}`)
      await expect(page.locator(`[data-figure-id="${id}"]`)).toHaveCount(0)
    }
    for (const question of fixture.questions) {
      await page.goto(`/#learn/${fixture.week}/physics/${question}`)
      await expect(page.locator('.focus-section')).toHaveAttribute('aria-labelledby', `focus-step-${question}`)
      const answer = page.locator('.focus-section .problem-card > details'), figure = answer.locator(`[data-figure-id="${id}"]`)
      await expect(figure).toHaveCount(1); await expect(figure).not.toBeVisible()
      await selectQuestionFor(page, answer); await answer.locator('summary').focus(); await page.keyboard.press('Enter'); await expect(figure).toBeVisible()
      await page.getByRole('button', { name: '下一节 →', exact: true }).click(); await page.goBack()
      await expect(page).toHaveURL(new RegExp(`#learn/${fixture.week}/physics/${question}$`))
      await expect(answer).not.toHaveAttribute('open', ''); await expect(figure).not.toBeVisible()
    }
    await expectProgressUnchanged(page)
  })
}

for (const week of [9, 10]) {
  test(`week ${week} regular quizzes and optional activities retain their boundaries without new cumulative maps`, async ({ page }) => {
    expect(['chinese', 'math', 'english', 'physics', 'chemistry'].reduce((sum, subject) => sum + lessonFor(week, subject).budget.coreMinutes, 0)).toBe(870)
    for (const subject of ['chinese', 'math', 'english', 'physics', 'chemistry']) {
      const lesson = lessonFor(week, subject)
      await page.goto(`/#learn/${week}/${subject}/prepare`)
      await expect(page.locator('.enriched-content')).toContainText(lesson.budget.busyPolicy)
      if (subject === 'english') await expect(page.locator('.focus-title')).toContainText('听力文字预训练，无音频')
      else await expect(page.locator('.focus-title')).not.toContainText('听力文字预训练，无音频')
      await page.locator('.focus-directory > summary').click()
      await expect(page.locator('.focus-directory button').filter({ hasText: '20 分短测' })).toHaveCount(1)
      await expect(page.locator('.focus-directory button').filter({ hasText: '累计诊断' })).toHaveCount(0)
      await page.locator('.focus-directory button').filter({ hasText: '20 分短测' }).click()
      await expect(page.locator('.focus-section .problem-card')).toHaveCount(lesson.quiz.questions.length)
      await expect(page.locator('.focus-section .problem-card details[open]')).toHaveCount(0)
      await expect(page.locator('.focus-section .static-lesson-figure')).toHaveCount(0)
      await page.goto(`/#learn/${week}/${subject}/review`)
      await expect(page.locator('.enriched-content')).toContainText('16 / 20')
      await expect(page.locator('.cumulative-review-map')).toHaveCount(0)
      const extension = [...lesson.sections, ...lesson.workedExamples, ...lesson.practice].find(item => item.level === 'extension')
      if (extension) { await page.goto(`/#learn/${week}/${subject}/${extension.id}`); await expect(page.locator('.focus-section-title')).toContainText('可选拓展'); await expect(page.locator('.focus-checkpoint')).toHaveCount(0) }
    }
    await page.getByRole('button', { name: '← 退出专注', exact: true }).click()
    await expect(page.locator('.topbar')).toContainText('第 1 周')
    await expect(page.locator('.subject-tabs')).toContainText('第三科 · 待确认')
    await expectProgressUnchanged(page)
  })
  test(`week ${week} AI sends only an explicitly selected prompt with no hidden answer or figure`, async ({ page }) => {
    const fakeKey = 'MOCK_DEEPSEEK_KEY_FOR_NEW_LESSON_TESTS', lesson = lessonFor(week, 'physics'), question = lesson.workedExamples.find(question => question.id === (week === 9 ? 'w9-physics-ex4' : 'w10-physics-ex3'))!
    let calls = 0, payload = ''
    await page.route('https://api.deepseek.com/chat/completions', async route => { calls++; payload = route.request().postData() || ''; await route.fulfill({ json: { choices: [{ message: { content: '先看图的纵轴与单位。' }, finish_reason: 'stop' }] } }) })
    await page.goto(`/#learn/${week}/physics/${question.id}`)
    await page.getByRole('button', { name: '这一步没懂', exact: true }).click()
    const settings = page.locator('.ai-settings'); if (!await settings.evaluate(element => (element as HTMLDetailsElement).open)) await settings.locator('summary').click()
    await page.getByLabel('DeepSeek API Key', { exact: true }).fill(fakeKey)
    await page.getByLabel('你的问题').fill('请给我提示，先不要直接给答案。')
    await page.getByLabel('附带的学习资料（可选）').selectOption({ index: 1 })
    const preview = await page.locator('.ai-context-preview pre').innerText()
    expect(preview).toContain(question.prompt); expect(preview).not.toContain(question.answer)
    for (const figure of figures.filter(figure => figure.week === week && figure.subject === 'physics')) expect(preview).not.toContain(figure.altText)
    expect(calls).toBe(0)
    await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click()
    await expect(page.locator('.ai-answer')).toContainText('纵轴与单位')
    expect(calls).toBe(1); expect(payload).toContain(JSON.stringify(preview).slice(1, -1)); expect(payload).not.toContain(fakeKey); expect(payload).not.toContain(JSON.stringify(question.answer).slice(1, -1))
    expect(await page.evaluate(() => localStorage.getItem('xunxu.deepseek.api-key.v1'))).toBeNull()
    await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: '这一步没懂', exact: true })).toBeFocused()
    await expectProgressUnchanged(page)
  })
}
