import { test, expect, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { normalizeReviewMap } from '../../src/curriculum/review-map'
import type { EnrichedLesson } from '../../src/curriculum/enriched-types'

const key = 'xunxu.gaokao.v1'
const subjects = ['chinese', 'math', 'english', 'physics', 'chemistry'] as const
const readJson = <T>(week: number, path: string): T => JSON.parse(readFileSync(new URL(`../../src/curriculum/enriched-week-${String(week).padStart(2, '0')}/${path}`, import.meta.url), 'utf8'))
const lessonFor = (week: number, subject: string) => readJson<EnrichedLesson>(week, `${subject}.json`)
interface Figure { id: string; title: string; altText: string; description: string; linkedSectionIds: string[]; linkedQuestionIds: string[]; answerOnly?: boolean }
const figures = [11, 12].flatMap(week => ['math', 'physics', 'chemistry'].flatMap(subject => readJson<Figure[]>(week, `assets/${subject}-figures.json`).map(figure => ({ ...figure, week, subject }))))
// Keep these associations explicit: loading the same wrong metadata as the UI must not pass.
const answerFigures = [
  { week: 11, subject: 'physics', id: 'w11-physics-figure2', questionId: 'w11-physics-ex3' },
  { week: 11, subject: 'physics', id: 'w11-physics-figure3', questionId: 'w11-physics-ex4' },
  { week: 12, subject: 'math', id: 'w12-math-exp-absolute', questionId: 'w12-math-ex4' },
  { week: 12, subject: 'physics', id: 'w12-physics-figure2', questionId: 'w12-physics-ex1' },
  { week: 12, subject: 'physics', id: 'w12-physics-figure3', questionId: 'w12-physics-ex3' },
  { week: 12, subject: 'physics', id: 'w12-physics-figure4', questionId: 'w12-physics-quiz4' },
]
const reviewCases = [
  { subject: 'chinese', weeks: [1, 3, 4, 5, 6, 8, 9, 10, 11, 12], range: '1、3、4、5、6、8、9、10、11、12' },
  { subject: 'math', weeks: [4, 5, 6, 7, 8, 9, 10, 11, 12], range: '4—12' },
  { subject: 'english', weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], range: '1—12' },
  { subject: 'physics', weeks: [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12], range: '1、2、3、5、6、7、8、9、10、11、12' },
  { subject: 'chemistry', weeks: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], range: '3—12' },
]

async function goToStep(page: Page, week: number, subject: string, step: string) {
  await page.goto(`/#learn/${week}/${subject}/${step}`)
  await expect(page.locator('.focus-section')).toHaveAttribute('aria-labelledby', `focus-step-${step}`)
}

async function expectDecodedFigure(figure: Locator) {
  // A visible lazy image can still be unloaded until its viewport is approached.
  await figure.scrollIntoViewIfNeeded()
  await expect(figure.locator('img')).toBeVisible()
  await expect.poll(() => figure.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
}

async function expectProgressUnchanged(page: Page) {
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{"currentWeek":1,"weeks":{}}'), key)
  expect(saved.currentWeek).toBe(1)
  expect(saved.settings?.thirdConfirmed ?? false).toBe(false)
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
  test(`week ${fixture.week} ${fixture.id} decodes in both themes with equivalent text and mobile keyboard scrolling`, async ({ page }, info) => {
    const lesson = lessonFor(fixture.week, fixture.subject)
    const questionId = fixture.linkedQuestionIds[0]
    const step = questionId ? (lesson.quiz.questions.some(question => question.id === questionId) ? 'quiz' : questionId) : fixture.linkedSectionIds[0]!
    await goToStep(page, fixture.week, fixture.subject, step)
    const figure = page.locator(`[data-figure-id="${fixture.id}"]`)
    await expect(figure).toHaveCount(1)
    if (questionId) {
      const disclosure = page.locator('.focus-section .problem-card > details').filter({ has: figure })
      await expect(disclosure).not.toHaveAttribute('open', '')
      await expect(figure).not.toBeVisible()
      await disclosure.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(disclosure).toHaveAttribute('open', '')
    }
    const image = figure.locator('img')
    await expectDecodedFigure(figure)
    await expect(image).toHaveAttribute('alt', fixture.altText)
    await expect(image).toHaveAttribute('src', /\.svg(?:\?|$)/)
    await expect(image).not.toHaveAttribute('src', /\/workspace\//)
    await expect(figure.locator('figcaption')).toContainText(fixture.title)
    await expect(figure.locator('figcaption')).toContainText(fixture.description)
    await expect(figure.getByRole('link', { name: '查看原图 ↗' })).toHaveAttribute('href', (await image.getAttribute('src'))!)
    await expect(page.locator('.focus-section svg')).toHaveCount(0)
    for (const theme of ['深色', '浅色']) {
      const options = page.locator('.focus-options')
      if (await options.getAttribute('open') === null) await options.locator('summary').click()
      await options.getByRole('button', { name: theme, exact: true }).click()
      await options.locator('summary').click()
      await expectDecodedFigure(figure)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(await figure.locator('.static-figure-image').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)')
      await figure.screenshot({ path: `test-results/week${fixture.week}-${fixture.id}-${info.project.name}-${theme === '深色' ? 'dark' : 'light'}.png` })
      const region = figure.getByRole('region', { name: `${fixture.title}，可左右滚动查看`, exact: true })
      await expect(region).toHaveAttribute('tabindex', '0')
      if (info.project.name === 'mobile') {
        await region.evaluate(element => { element.scrollLeft = 0 })
        await region.focus()
        await expect(region).toBeFocused()
        await page.keyboard.press('ArrowRight')
        await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
    }
    await expectProgressUnchanged(page)
  })
}

for (const fixture of answerFigures) {
  test(`${fixture.id} is exclusive to ${fixture.questionId} and closes again after navigation and reload`, async ({ page }) => {
    test.setTimeout(120000)
    const lesson = lessonFor(fixture.week, fixture.subject)
    const source = figures.find(figure => figure.id === fixture.id)!
    expect(source.answerOnly).toBe(true)
    expect(source.linkedSectionIds).toEqual([])
    expect(source.linkedQuestionIds).toEqual([fixture.questionId])
    const quizIndex = lesson.quiz.questions.findIndex(question => question.id === fixture.questionId)
    const targetStep = quizIndex >= 0 ? 'quiz' : fixture.questionId
    const steps = ['prepare', 'diagnostic', ...lesson.sections.map(section => section.id), ...lesson.workedExamples.map(question => question.id), ...lesson.practice.map(question => question.id), 'quiz', 'review']
    for (const step of steps.filter(step => step !== targetStep)) {
      await goToStep(page, fixture.week, fixture.subject, step)
      await expect(page.locator(`[data-figure-id="${fixture.id}"]`)).toHaveCount(0)
    }
    await goToStep(page, fixture.week, fixture.subject, targetStep)
    const cards = page.locator('.focus-section .problem-card')
    const card = quizIndex >= 0 ? cards.nth(quizIndex) : cards.first()
    const answer = card.locator(':scope > details')
    const figure = answer.locator(`[data-figure-id="${fixture.id}"]`)
    await expect(page.locator(`[data-figure-id="${fixture.id}"]`)).toHaveCount(1)
    await expect(figure).toHaveCount(1)
    await expect(answer).not.toHaveAttribute('open', '')
    await expect(figure).not.toBeVisible()
    if (quizIndex >= 0) {
      // The only quiz answer image belongs to quiz4, never another cumulative question.
      expect(fixture.questionId).toBe('w12-physics-quiz4')
      expect(quizIndex).toBe(3)
      await expect(cards).toHaveCount(4)
      await expect(card.locator('.problem-prompt')).toHaveText(lesson.quiz.questions[quizIndex]!.prompt)
      for (let index = 0; index < lesson.quiz.questions.length; index++) {
        if (index === quizIndex) continue
        const other = cards.nth(index)
        await other.locator('details > summary').click()
        await expect(other.locator('.static-lesson-figure')).toHaveCount(0)
        await expect(answer).not.toHaveAttribute('open', '')
        await expect(figure).not.toBeVisible()
      }
    }
    await answer.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expectDecodedFigure(figure)
    await page.getByRole('button', { name: '下一节 →', exact: true }).click()
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`#learn/${fixture.week}/${fixture.subject}/${targetStep}$`))
    await expect(answer).not.toHaveAttribute('open', '')
    await expect(figure).not.toBeVisible()
    await expect(page.locator('.focus-section .problem-card > details[open]')).toHaveCount(0)
    await answer.locator('summary').click()
    await expect(figure).toBeVisible()
    await page.reload()
    await expect(answer).not.toHaveAttribute('open', '')
    await expect(figure).not.toBeVisible()
    await expectProgressUnchanged(page)
  })
}

for (const week of [11, 12]) {
  test(`week ${week} has one 20-point assessment per subject within 870 core minutes and preserves the third-subject reserve`, async ({ page }) => {
    test.setTimeout(90000)
    const lessons = subjects.map(subject => lessonFor(week, subject))
    expect(lessons.reduce((sum, lesson) => sum + lesson.budget.coreMinutes, 0)).toBe(870)
    expect(figures).toHaveLength(15)
    expect(figures.filter(figure => figure.week === week)).toHaveLength(week === 11 ? 7 : 8)
    expect(figures.filter(figure => figure.answerOnly).map(figure => figure.id).sort()).toEqual(answerFigures.map(figure => figure.id).sort())
    for (const subject of subjects) {
      const lesson = lessonFor(week, subject)
      expect(lesson.budget.segments.reduce((sum, segment) => sum + segment.minutes, 0)).toBe(lesson.budget.coreMinutes)
      expect(lesson.quiz.totalPoints).toBe(20)
      expect(lesson.quiz.questions.reduce((sum, question) => sum + question.points!, 0)).toBe(20)
      for (const question of lesson.quiz.questions) expect(lesson.budget.segments.flatMap(segment => segment.activityIds).filter(id => id === question.id)).toHaveLength(1)
      const quizTitle = week === 12 ? '20 分累计诊断' : '20 分短测'
      await goToStep(page, week, subject, 'prepare')
      await expect(page.locator('.enriched-content')).toContainText(`核心内容约 ${lesson.budget.coreMinutes} 分钟`)
      await expect(page.locator('.enriched-content')).toContainText(lesson.budget.busyPolicy)
      await expect(page.locator('.cumulative-review-map')).toHaveCount(0)
      if (subject === 'english') {
        await expect(page.locator('.focus-title')).toContainText('听力文字预训练，无音频')
        await expect(page.locator('.enriched-content')).toContainText(lesson.audioStatus!)
        // The global podcast host has no source until explicitly selected; English still has no lesson audio.
        await expect(page.locator('audio[src]')).toHaveCount(0)
        await expect(page.locator('.lesson-podcast')).toHaveCount(0)
      } else await expect(page.locator('.focus-title')).not.toContainText('听力文字预训练，无音频')
      if (subject === 'chemistry') await expect(page.locator('.enriched-content')).toContainText(lesson.safetyScope!)
      await page.locator('.focus-directory > summary').click()
      await expect(page.locator('.focus-directory button').filter({ hasText: quizTitle })).toHaveCount(1)
      await expect(page.locator('.focus-directory button').filter({ hasText: week === 12 ? '分短测' : '累计诊断' })).toHaveCount(0)
      await page.locator('.focus-directory button').filter({ hasText: quizTitle }).click()
      await expect(page.locator('.focus-section-title')).toHaveText(quizTitle)
      await expect(page.locator('.focus-section .problem-card')).toHaveCount(4)
      await expect(page.locator('.focus-section .problem-card details[open]')).toHaveCount(0)
      await expect(page.locator('.focus-section')).toContainText('共 20 分')
      await expect(page.locator('.focus-section')).toContainText('页面不提供自动评分')
      await expect(page.locator('.cumulative-review-map')).toHaveCount(0)
      const quizFigures = figures.filter(figure => figure.week === week && figure.subject === subject && figure.linkedQuestionIds.some(id => lesson.quiz.questions.some(question => question.id === id)))
      await expect(page.locator('.focus-section .static-lesson-figure')).toHaveCount(quizFigures.length)
      for (const figure of quizFigures) await expect(page.locator(`[data-figure-id="${figure.id}"]`)).not.toBeVisible()
      await goToStep(page, week, subject, 'review')
      await expect(page.locator('.enriched-content')).toContainText('16 / 20')
      await expect(page.locator('.enriched-content')).toContainText('没有自动评分、自动达标或自动跳周')
      for (const instruction of lesson.reviewActivity?.instructions || []) await expect(page.locator('.enriched-content')).toContainText(instruction)
      await expect(page.locator('.cumulative-review-map')).toHaveCount(week === 12 ? 1 : 0)
      if (week === 12) await expect(page.locator('.cumulative-review-map')).not.toHaveAttribute('open', '')
    }
    await page.getByRole('button', { name: '← 退出专注', exact: true }).click()
    await expect(page.locator('.topbar')).toContainText('第 1 周')
    await expect(page.getByLabel('浏览学习周')).toHaveValue(String(week))
    await expect(page.locator('.subject-tabs')).toContainText('第三科 · 待确认')
    const quota = page.getByLabel('本学习周建议方案')
    await expect(quota).toHaveValue('normal')
    await expect(quota.locator('option:checked')).toContainText('16 小时建议')
    expect(16 * 60 - lessons.reduce((sum, lesson) => sum + lesson.budget.coreMinutes, 0)).toBe(90)
    await expectProgressUnchanged(page)
  })
}

test('week-eleven Chinese keeps its deliberate three writing exercises in the existing 20-minute budget', async ({ page }) => {
  const lesson = lessonFor(11, 'chinese')
  expect(lesson.practice.map(question => question.id)).toEqual(['w11-cn-pr1', 'w11-cn-pr2', 'w11-cn-pr3'])
  expect(lesson.practice.map(question => question.estimatedMinutes)).toEqual([6, 7, 7])
  const practiceIds = new Set(lesson.practice.map(question => question.id))
  const segments = lesson.budget.segments.filter(segment => segment.activityIds.some(id => practiceIds.has(id)))
  expect(segments.reduce((sum, segment) => sum + segment.minutes, 0)).toBe(20)
  await goToStep(page, 11, 'chinese', 'prepare')
  const schedule = page.locator('.enriched-content details').filter({ has: page.getByText('查看时间安排', { exact: true }) })
  await schedule.locator('summary').click()
  for (const segment of segments) await expect(schedule).toContainText(`${segment.title} · ${segment.minutes} 分钟`)
  await page.locator('.focus-directory > summary').click()
  await expect(page.locator('.focus-directory button').filter({ hasText: /练习 \d+ ·/ })).toHaveCount(3)
  for (const question of lesson.practice) {
    await goToStep(page, 11, 'chinese', question.id)
    await expect(page.locator('.problem-prompt')).toHaveText(question.prompt)
    await expect(page.locator('.problem-answer')).not.toHaveAttribute('open', '')
    await expect(page.locator('.cumulative-review-map')).toHaveCount(0)
  }
  await expectProgressUnchanged(page)
  await expect(page.locator('.focus-checkpoint')).toContainText('沿用本周历史打卡，不代表深化内容已完成')
  await page.locator('.focus-checkpoint input').check()
  await page.reload()
  await expect(page.locator('.focus-checkpoint input')).toBeChecked()
  await goToStep(page, 12, 'chinese', lessonFor(12, 'chinese').practice.at(-1)!.id)
  await expect(page.locator('.focus-checkpoint input')).not.toBeChecked()
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)
  expect(saved.currentWeek).toBe(1)
  expect(saved.settings.thirdConfirmed).toBe(false)
  for (const [week, record] of Object.entries(saved.weeks) as [string, { sessions: unknown[]; completed: string[] }][]) {
    expect(record.sessions).toEqual([])
    expect(record.completed).toEqual(week === '11' ? ['w11-chinese-practice'] : [])
  }
  await goToStep(page, 11, 'chinese', 'w11-cn-pr3')
  await expect(page.locator('.focus-checkpoint input')).toBeChecked()
  await page.locator('.focus-checkpoint input').uncheck()
  await expectProgressUnchanged(page)
})

for (const fixture of reviewCases) {
  test(`week-twelve ${fixture.subject} has a closed answer-review map with its actual week range and current-week return paths`, async ({ page }) => {
    test.setTimeout(90000)
    const lesson = lessonFor(12, fixture.subject)
    const review = normalizeReviewMap(readJson<unknown>(12, `assets/${fixture.subject}-review-map.json`), lesson)
    const skills = review.questions.flatMap(question => question.skills)
    expect(review.totalPoints).toBe(20)
    expect(review.questions.reduce((sum, question) => sum + question.points, 0)).toBe(20)
    expect(skills.reduce((sum, skill) => sum + skill.points, 0)).toBe(20)
    expect([...new Set(skills.flatMap(skill => skill.weeks))].sort((a, b) => a - b)).toEqual(fixture.weeks)
    const map = page.locator('.cumulative-review-map')
    const summary = map.locator('summary')
    for (const step of ['prepare', 'diagnostic', lesson.sections[0]!.id, lesson.workedExamples[0]!.id, lesson.practice[0]!.id, 'quiz']) {
      await goToStep(page, 12, fixture.subject, step)
      await expect(map).toHaveCount(0)
    }
    await expect(page.locator('.focus-section-title')).toHaveText('20 分累计诊断')
    await expect(page.locator('.focus-section .problem-card')).toHaveCount(4)
    await expect(page.locator('.focus-section .problem-card details[open]')).toHaveCount(0)
    await expect(page.locator('.focus-section .problem-card details > summary').filter({ hasText: /^累计诊断完成后核对答案与评分点$/ })).toHaveCount(4)
    const firstAnswer = page.locator('.focus-section .problem-card details').first()
    await firstAnswer.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(firstAnswer).toHaveAttribute('open', '')
    await expect(map).toHaveCount(0)
    await page.locator('.focus-directory > summary').click()
    await expect(page.locator('.focus-directory button').filter({ hasText: '20 分累计诊断' })).toHaveCount(1)
    await expect(page.locator('.focus-directory button').filter({ hasText: '分短测' })).toHaveCount(0)
    await page.locator('.focus-directory button').filter({ hasText: '订正与回顾' }).click()
    await expect(page).toHaveURL(new RegExp(`#learn/12/${fixture.subject}/review$`))
    await expect(map).toHaveCount(1)
    await expect(summary).toHaveText(`做完累计诊断后，查看第${fixture.range}周技能回查`)
    await expect(map).not.toHaveAttribute('open', '')
    await expect(map.locator('article').first()).not.toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`#learn/12/${fixture.subject}/quiz$`))
    await expect(firstAnswer).not.toHaveAttribute('open', '')
    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`#learn/12/${fixture.subject}/review$`))
    await expect(map).not.toHaveAttribute('open', '')
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(map).toHaveAttribute('open', '')
    await expect(map.locator('article')).toHaveCount(4)
    await expect(map.locator('li')).toHaveCount(skills.length)
    await expect(map).toContainText(`20 分累计诊断的回查表，已计入原有 ${review.minutes} 分钟测评安排`)
    await expect(map).toContainText('不是额外试卷')
    await expect(map).toContainText('每项分值只计一次')
    await expect(map).toContainText('不重复加分')
    await expect(map).toContainText('不代表对这些周次做了全面测评')
    for (const skill of skills) await expect(map).toContainText(`${skill.skill} · ${skill.points} 分 · 关联第 ${skill.weeks.join('、')} 周`)
    const titles = new Set(lesson.sections.map(section => section.title))
    const buttons = map.getByRole('button')
    await expect(buttons).toHaveCount(skills.reduce((sum, skill) => sum + skill.sectionIds.length, 0))
    for (const label of await buttons.allTextContents()) expect(titles.has(label.replace(/^回看：/, '').replace(/ →$/, ''))).toBe(true)
    const firstTarget = skills[0]!.sectionIds[0]!
    const firstTitle = lesson.sections.find(section => section.id === firstTarget)!.title
    await map.getByRole('button', { name: `回看：${firstTitle} →`, exact: true }).first().focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`#learn/12/${fixture.subject}/${firstTarget}$`))
    await expect(page.locator('.focus-section-title')).toHaveText(firstTitle)
    await expect(page.locator('.focus-section-title')).toBeFocused()
    await expect(map).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`#learn/12/${fixture.subject}/review$`))
    await expect(map).not.toHaveAttribute('open', '')
    await summary.click()
    await page.reload()
    await expect(map).not.toHaveAttribute('open', '')
    await page.getByRole('button', { name: '← 退出专注', exact: true }).click()
    await expect(page.locator('.topbar')).toContainText('第 1 周')
    await expect(page.getByLabel('浏览学习周')).toHaveValue('12')
    await expect(page.locator('.subject-tabs')).toContainText('第三科 · 待确认')
    await expectProgressUnchanged(page)
  })
}

for (const fixture of [answerFigures[0]!, answerFigures[2]!, answerFigures[5]!]) {
  test(`${fixture.questionId} AI sends only the explicitly selected prompt without answers, scoring, other questions or figures`, async ({ page }) => {
    const fakeKey = 'MOCK_DEEPSEEK_KEY_FOR_NEW_LESSON_TESTS'
    const lesson = lessonFor(fixture.week, fixture.subject)
    const allQuestions = [...lesson.diagnostic.questions, ...lesson.workedExamples, ...lesson.practice, ...lesson.quiz.questions]
    const question = allQuestions.find(question => question.id === fixture.questionId)!
    const step = lesson.quiz.questions.some(item => item.id === question.id) ? 'quiz' : question.id
    let calls = 0, payload = ''
    await page.route('https://api.deepseek.com/chat/completions', async route => {
      calls++
      payload = route.request().postData() || ''
      await route.fulfill({ json: { choices: [{ message: { content: '先找题目给定的条件，再决定第一步。' }, finish_reason: 'stop' }] } })
    })
    await goToStep(page, fixture.week, fixture.subject, step)
    await page.getByRole('button', { name: '问 AI', exact: true }).click()
    const settings = page.locator('.ai-settings')
    if (!await settings.evaluate(element => (element as HTMLDetailsElement).open)) await settings.locator('summary').click()
    await page.getByLabel('DeepSeek API Key', { exact: true }).fill(fakeKey)
    await page.getByLabel('你的问题').fill('请给我提示，先不要直接给答案。')
    const selector = page.getByLabel('附带的学习资料（可选）')
    await expect(selector).toHaveValue('')
    await expect(page.locator('.ai-context-preview')).toHaveCount(0)
    expect(calls).toBe(0)
    // Select by question ID so the cumulative quiz4 case cannot silently send quiz1.
    await selector.selectOption(question.id)
    const preview = await page.locator('.ai-context-preview pre').innerText()
    expect(preview).toContain(question.prompt)
    const hiddenText = [question.answer, ...question.steps, ...(question.scoring || []).map(rule => rule.criterion), ...allQuestions.filter(item => item.id !== question.id).map(item => item.prompt), ...figures.filter(figure => figure.week === fixture.week && figure.subject === fixture.subject).map(figure => figure.altText)]
    for (const text of hiddenText) expect(preview).not.toContain(text)
    expect(calls).toBe(0)
    await page.getByRole('button', { name: '取消附带', exact: true }).click()
    await expect(selector).toHaveValue('')
    await expect(page.locator('.ai-context-preview')).toHaveCount(0)
    await selector.selectOption(question.id)
    await expect(page.locator('.ai-context-preview pre')).toHaveText(preview)
    expect(calls).toBe(0)
    await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click()
    await expect(page.locator('.ai-answer')).toContainText('题目给定的条件')
    expect(calls).toBe(1)
    expect(payload).toContain(JSON.stringify(preview).slice(1, -1))
    expect(payload).not.toContain(fakeKey)
    for (const text of hiddenText) expect(payload).not.toContain(JSON.stringify(text).slice(1, -1))
    expect(await page.evaluate(() => localStorage.getItem('xunxu.deepseek.api-key.v1'))).toBeNull()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: '问 AI', exact: true })).toBeFocused()
    await expect(page.locator('.focus-section .problem-card details[open]')).toHaveCount(0)
    await expectProgressUnchanged(page)
  })
}
