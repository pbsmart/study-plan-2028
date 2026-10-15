import { selectQuestionFor } from './ui-audit'
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { EnrichedLesson } from '../../src/curriculum/enriched-types'

const key = 'xunxu.gaokao.v1'
const reviewSummary = '做完累计诊断后，查看第1—4周技能回查'
const subjects = ['chinese', 'math', 'english', 'physics', 'chemistry'] as const
const readJson = <T>(week: number, path: string): T => JSON.parse(readFileSync(new URL(`../../src/curriculum/enriched-week-${String(week).padStart(2, '0')}/${path}`, import.meta.url), 'utf8'))
const lessonFor = (week: number, subject: string) => readJson<EnrichedLesson>(week, `${subject}.json`)
interface Figure { id: string; title: string; altText: string; description: string; linkedSectionIds: string[]; linkedQuestionIds: string[] }
const figures = [3, 4].flatMap(week => ['math', 'physics', 'chemistry'].flatMap(subject => readJson<Figure[]>(week, `assets/${subject}-figures.json`).map(figure => ({ ...figure, week, subject }))))
interface ReviewRow { skill?: string; sectionIds?: string[]; remediationSectionIds?: string[]; skills?: ReviewRow[]; scoringPointMap?: ReviewRow[] }
interface ReviewSource { scoringMap?: ReviewRow[]; questions?: ReviewRow[] }
const reviewSkills = (subject: string) => {
  const source = readJson<ReviewSource>(4, `assets/${subject}-review-map.json`)
  return (source.scoringMap || source.questions || []).flatMap(row => (row.skills || row.scoringPointMap || [row]).map(skill => ({ skill: skill.skill!, sectionIds: skill.remediationSectionIds || skill.sectionIds || row.remediationSectionIds || [] })))
}
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
    // Loading lazy SVGs requires viewport proximity, including on mobile.
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

test('week-three interval answers never leak into the linked teaching section or another problem', async ({ page }) => {
  test.setTimeout(60000)
  const fixture = figures.find(figure => figure.id === 'w3-math-figure-interval')!
  const lesson = lessonFor(3, 'math')
  // Keep the authored section association, but render this result-bearing image only in example 4's answer.
  expect(fixture.linkedSectionIds).toEqual(['w3-math-s6'])
  expect(fixture.linkedQuestionIds).toEqual(['w3-math-ex4'])
  for (const step of ['prepare', 'diagnostic', ...lesson.sections.map(section => section.id), ...lesson.workedExamples.filter(question => question.id !== 'w3-math-ex4').map(question => question.id), 'quiz', 'review']) {
    await page.goto(`/#learn/3/math/${step}`)
    await expect(page.locator(`[data-figure-id="${fixture.id}"]`)).toHaveCount(0)
  }
  await page.goto('/#learn/3/math/w3-math-ex4')
  const disclosure = page.locator('.focus-section .problem-card > details')
  const figure = disclosure.locator(`[data-figure-id="${fixture.id}"]`)
  await expect(figure).toHaveCount(1)
  await expect(figure).not.toBeVisible()
  await selectQuestionFor(page, disclosure); await disclosure.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(figure).toBeVisible()
  await page.getByRole('button', { name: '下一节 →', exact: true }).click()
  await page.goBack()
  await expect(page).toHaveURL(/#learn\/3\/math\/w3-math-ex4$/)
  await expect(disclosure).not.toHaveAttribute('open', '')
  await expect(figure).not.toBeVisible()
  await expectProgressUnchanged(page)
})

test('week-three physics quiz diagram stays inside its own closed answer and resets after navigation', async ({ page }) => {
  const lesson = lessonFor(3, 'physics')
  const index = lesson.quiz.questions.findIndex(question => question.id === 'w3-physics-quiz2')
  await page.goto('/#learn/3/physics/quiz')
  const cards = page.locator('.focus-section .problem-card')
  const disclosure = cards.nth(index).locator('details')
  const figure = page.locator('[data-figure-id="w3-physics-fig-quiz2-given"]')
  await expect(cards).toHaveCount(lesson.quiz.questions.length)
  await expect(disclosure.locator('[data-figure-id="w3-physics-fig-quiz2-given"]')).toHaveCount(1)
  await expect(page.locator('.focus-section .static-lesson-figure')).toHaveCount(1)
  await expect(figure).not.toBeVisible()
  await selectQuestionFor(page, disclosure); await disclosure.locator('summary').focus()
  await page.keyboard.press('Space')
  await expect(figure).toBeVisible()
  await page.getByRole('button', { name: '下一节 →', exact: true }).click()
  await expect(page.locator('.static-lesson-figure')).toHaveCount(0)
  await page.goBack()
  await expect(disclosure).not.toHaveAttribute('open', '')
  await expect(figure).not.toBeVisible()
  await expectProgressUnchanged(page)
})

for (const subject of subjects) {
  test(`week-four ${subject} has one cumulative diagnostic and a closed review-only skill map with current-week navigation`, async ({ page }) => {
    test.setTimeout(90000)
    const lesson = lessonFor(4, subject)
    const skills = reviewSkills(subject)
    const map = page.locator('details').filter({ has: page.locator('summary', { hasText: reviewSummary }) })
    const summary = map.locator('summary')
    for (const step of ['prepare', 'diagnostic', lesson.sections[0]!.id, lesson.workedExamples[0]!.id, lesson.practice[0]!.id, 'quiz']) {
      await page.goto(`/#learn/4/${subject}/${step}`)
      await expect(map).toHaveCount(0)
    }
    await expect(page.locator('.focus-section-title')).toHaveText('20 分累计诊断')
    await expect(page.locator('.focus-section .problem-card')).toHaveCount(lesson.quiz.questions.length)
    expect(lesson.quiz.questions).toHaveLength(4)
    await expect(page.locator('.focus-section .problem-card details[open]')).toHaveCount(0)
    await expect(page.locator('.focus-section .problem-card details > summary').filter({ hasText: /^(?:短测|累计诊断)完成后核对答案与评分点$/ })).toHaveCount(lesson.quiz.questions.length)
    await expect(page.locator('.focus-section')).toContainText('页面不提供自动评分')
    await expect(page.locator('.focus-section .static-lesson-figure')).toHaveCount(0)
    await page.locator('.focus-directory > summary').click()
    await expect(page.locator('.focus-directory button').filter({ hasText: '20 分累计诊断' })).toHaveCount(1)
    await expect(page.locator('.focus-directory button').filter({ hasText: '分短测' })).toHaveCount(0)
    await page.locator('.focus-directory button').filter({ hasText: '订正与回顾' }).click()
    await expect(page).toHaveURL(new RegExp(`#learn/4/${subject}/review$`))
    await expect(map).toHaveCount(1)
    await expect(map).not.toHaveAttribute('open', '')
    await expect(map.locator('article').first()).not.toBeVisible()
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(map).toHaveAttribute('open', '')
    await expect(map.locator('article')).toHaveCount(lesson.quiz.questions.length)
    await expect(map.locator('li')).toHaveCount(skills.length)
    await expect(map).toContainText('不是额外试卷')
    await expect(map).toContainText('不重复加分')
    for (const skill of skills) await expect(map).toContainText(skill.skill)
    const titles = new Map(lesson.sections.map(section => [section.title, section.id]))
    const buttons = map.getByRole('button')
    for (const label of await buttons.allTextContents()) expect(titles.has(label.replace(/^回看：/, '').replace(/ →$/, ''))).toBe(true)
    const firstTarget = skills[0]!.sectionIds[0]!
    const firstTitle = lesson.sections.find(section => section.id === firstTarget)!.title
    await map.getByRole('button', { name: `回看：${firstTitle} →`, exact: true }).first().focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`#learn/4/${subject}/${firstTarget}$`))
    await expect(page.locator('.focus-section-title')).toHaveText(firstTitle)
    await expect(page.locator('.focus-section-title')).toBeFocused()
    await expect(map).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`#learn/4/${subject}/review$`))
    await expect(map).not.toHaveAttribute('open', '')
    await summary.click()
    await page.reload()
    await expect(map).not.toHaveAttribute('open', '')
    await page.getByRole('button', { name: '← 退出专注', exact: true }).click()
    await expect(page.locator('.topbar')).toContainText('第 1 周')
    await expect(page.getByLabel('浏览学习周')).toHaveValue('4')
    await expectProgressUnchanged(page)
  })
}

test('week-four teaching figures never spill into example or practice answers', async ({ page }) => {
  test.setTimeout(90000)
  for (const subject of ['math', 'physics', 'chemistry']) {
    const lesson = lessonFor(4, subject)
    const teaching = figures.filter(figure => figure.week === 4 && figure.subject === subject)
    expect(teaching.every(figure => figure.linkedSectionIds.length > 0 && figure.linkedQuestionIds.length === 0)).toBe(true)
    for (const question of [...lesson.workedExamples, ...lesson.practice]) {
      await page.goto(`/#learn/4/${subject}/${question.id}`)
      const answer = page.locator('.focus-section .problem-card > details')
      await expect(answer).not.toHaveAttribute('open', '')
      await selectQuestionFor(page, answer); await answer.locator('summary').click()
      await expect(page.locator('.static-lesson-figure')).toHaveCount(0)
    }
  }
  await expectProgressUnchanged(page)
})
