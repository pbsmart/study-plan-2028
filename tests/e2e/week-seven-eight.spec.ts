import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { normalizeReviewMap } from '../../src/curriculum/review-map'
import type { EnrichedLesson } from '../../src/curriculum/enriched-types'

const key = 'xunxu.gaokao.v1'
const subjects = ['chinese', 'math', 'english', 'physics', 'chemistry'] as const
const reviewSummary = '做完累计诊断后，查看第1—8周技能回查'
const readJson = <T>(week: number, path: string): T => JSON.parse(readFileSync(new URL(`../../src/curriculum/enriched-week-${String(week).padStart(2, '0')}/${path}`, import.meta.url), 'utf8'))
const lessonFor = (week: number, subject: string) => readJson<EnrichedLesson>(week, `${subject}.json`)
interface Figure { id: string; title: string; altText: string; description: string; linkedSectionIds: string[]; linkedQuestionIds: string[]; answerOnly?: boolean }
const figures = [7, 8].flatMap(week => ['math', 'physics', 'chemistry'].flatMap(subject => readJson<Figure[]>(week, `assets/${subject}-figures.json`).map(figure => ({ ...figure, week, subject }))))
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
      await disclosure.locator('summary').focus()
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


test('week-seven physics answer diagram is exclusive to example four and resets after leaving', async ({ page }) => {
  test.setTimeout(90000)
  const lesson = lessonFor(7, 'physics')
  const fixture = figures.find(figure => figure.id === 'w7-physics-figure4')!
  expect(fixture.answerOnly).toBe(true)
  expect(fixture.linkedSectionIds).toEqual([])
  expect(fixture.linkedQuestionIds).toEqual(['w7-physics-ex4'])
  for (const step of ['prepare', 'diagnostic', ...lesson.sections.map(section => section.id), ...lesson.workedExamples.filter(question => question.id !== 'w7-physics-ex4').map(question => question.id), ...lesson.practice.map(question => question.id), 'quiz', 'review']) {
    await page.goto(`/#learn/7/physics/${step}`)
    await expect(page.locator(`[data-figure-id="${fixture.id}"]`)).toHaveCount(0)
  }
  await page.goto('/#learn/7/physics/w7-physics-ex4')
  const answer = page.locator('.focus-section .problem-card > details')
  const figure = answer.locator(`[data-figure-id="${fixture.id}"]`)
  await expect(figure).toHaveCount(1)
  await expect(answer).not.toHaveAttribute('open', '')
  await expect(figure).not.toBeVisible()
  await answer.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(figure).toBeVisible()
  await page.getByRole('button', { name: '下一节 →', exact: true }).click()
  await page.goBack()
  await expect(page).toHaveURL(/#learn\/7\/physics\/w7-physics-ex4$/)
  await expect(answer).not.toHaveAttribute('open', '')
  await expect(figure).not.toBeVisible()
  await expectProgressUnchanged(page)
})

for (const week of [7, 8]) {
  test(`week ${week} budgets, assessment and optional activities preserve their boundaries`, async ({ page }) => {
    test.setTimeout(90000)
    const lessons = subjects.map(subject => lessonFor(week, subject))
    expect(lessons.reduce((sum, lesson) => sum + lesson.budget.coreMinutes, 0)).toBe(870)
    expect(figures.filter(figure => figure.week === week)).toHaveLength(10)
    for (const subject of subjects) {
      const lesson = lessonFor(week, subject)
      const quizTitle = week === 8 ? '20 分累计诊断' : '20 分短测'
      await page.goto(`/#learn/${week}/${subject}/prepare`)
      await expect(page.locator('.enriched-content')).toContainText(`核心内容约 ${lesson.budget.coreMinutes} 分钟`)
      await expect(page.locator('.enriched-content')).toContainText(lesson.budget.busyPolicy)
      if (subject === 'english') await expect(page.locator('.focus-title')).toContainText('听力文字预训练，无音频')
      else await expect(page.locator('.focus-title')).not.toContainText('听力文字预训练，无音频')
      await page.locator('.focus-directory > summary').click()
      await expect(page.locator('.focus-directory button').filter({ hasText: quizTitle })).toHaveCount(1)
      await expect(page.locator('.focus-directory button').filter({ hasText: week === 8 ? '分短测' : '累计诊断' })).toHaveCount(0)
      await page.locator('.focus-directory button').filter({ hasText: quizTitle }).click()
      await expect(page.locator('.focus-section-title')).toHaveText(quizTitle)
      await expect(page.locator('.focus-section .problem-card')).toHaveCount(lesson.quiz.questions.length)
      await expect(page.locator('.focus-section .problem-card details[open]')).toHaveCount(0)
      await expect(page.locator('.focus-section')).toContainText('共 20 分')
      await expect(page.locator('.focus-section')).toContainText('页面不提供自动评分')
      await expect(page.locator('.focus-section .static-lesson-figure')).toHaveCount(0)
      await page.goto(`/#learn/${week}/${subject}/review`)
      await expect(page.locator('.enriched-content')).toContainText(`${lesson.quiz.passRule.minScore} / 20`)
      await expect(page.locator('.cumulative-review-map')).toHaveCount(week === 8 ? 1 : 0)
      const extension = [...lesson.sections, ...lesson.workedExamples, ...lesson.practice].find(item => item.level === 'extension')
      if (extension) {
        await page.goto(`/#learn/${week}/${subject}/${extension.id}`)
        await expect(page.locator('.focus-section-title')).toContainText('可选拓展')
        await expect(page.locator('.focus-checkpoint')).toHaveCount(0)
      }
    }
    await page.getByRole('button', { name: '← 退出专注', exact: true }).click()
    await expect(page.locator('.topbar')).toContainText('第 1 周')
    await expect(page.getByLabel('浏览学习周')).toHaveValue(String(week))
    await expect(page.locator('.subject-tabs')).toContainText('第三科 · 待确认')
    const quota = page.getByLabel('本学习周建议方案')
    await expect(quota).toHaveValue('normal')
    await expect(quota.locator('option:checked')).toContainText('16 小时建议')
    // 870 core minutes plus the unchanged 90-minute third-subject reserve.
    expect(16 * 60 - lessons.reduce((sum, lesson) => sum + lesson.budget.coreMinutes, 0)).toBe(90)
    await expectProgressUnchanged(page)
  })

  test(`week ${week} teaching figures do not spill into unrelated question answers`, async ({ page }) => {
    test.setTimeout(120000)
    for (const subject of ['math', 'physics', 'chemistry']) {
      const lesson = lessonFor(week, subject)
      const subjectFigures = figures.filter(figure => figure.week === week && figure.subject === subject)
      const teaching = subjectFigures.filter(figure => !figure.answerOnly)
      expect(teaching.every(figure => figure.linkedSectionIds.length > 0 && figure.linkedQuestionIds.length === 0)).toBe(true)
      if (week === 8) expect(teaching).toHaveLength(subjectFigures.length)
      for (const question of [...lesson.workedExamples, ...lesson.practice]) {
        await page.goto(`/#learn/${week}/${subject}/${question.id}`)
        const answer = page.locator('.focus-section .problem-card > details')
        await expect(answer).not.toHaveAttribute('open', '')
        await answer.locator('summary').click()
        const linked = subjectFigures.filter(figure => figure.linkedQuestionIds.includes(question.id))
        await expect(page.locator('.focus-section .static-lesson-figure')).toHaveCount(linked.length)
        for (const figure of linked) await expect(answer.locator(`[data-figure-id="${figure.id}"]`)).toBeVisible()
      }
    }
    await expectProgressUnchanged(page)
  })

  test(`week ${week} AI sends only an explicitly selected prompt with no hidden answer, other question or figure`, async ({ page }) => {
    const fakeKey = 'MOCK_DEEPSEEK_KEY_FOR_NEW_LESSON_TESTS'
    const lesson = lessonFor(week, 'physics')
    const question = week === 7 ? lesson.workedExamples.find(question => question.id === 'w7-physics-ex4')! : lesson.quiz.questions[0]!
    const otherQuestion = week === 7 ? lesson.workedExamples[0]! : lesson.quiz.questions[1]!
    let calls = 0, payload = ''
    await page.route('https://api.deepseek.com/chat/completions', async route => {
      calls++
      payload = route.request().postData() || ''
      await route.fulfill({ json: { choices: [{ message: { content: '先找题目给定的条件，再决定第一步。' }, finish_reason: 'stop' }] } })
    })
    await page.goto(`/#learn/${week}/physics/${week === 7 ? question.id : 'quiz'}`)
    await page.getByRole('button', { name: '问 AI', exact: true }).click()
    const settings = page.locator('.ai-settings')
    if (!await settings.evaluate(element => (element as HTMLDetailsElement).open)) await settings.locator('summary').click()
    await page.getByLabel('DeepSeek API Key', { exact: true }).fill(fakeKey)
    await page.getByLabel('你的问题').fill('请给我提示，先不要直接给答案。')
    const selector = page.getByLabel('附带的学习资料（可选）')
    await expect(selector).toHaveValue('')
    await expect(page.locator('.ai-context-preview')).toHaveCount(0)
    expect(calls).toBe(0)
    await selector.selectOption({ index: 1 })
    const preview = await page.locator('.ai-context-preview pre').innerText()
    expect(preview).toContain(question.prompt)
    expect(preview).not.toContain(question.answer)
    expect(preview).not.toContain(otherQuestion.prompt)
    for (const figure of figures.filter(figure => figure.week === week && figure.subject === 'physics')) expect(preview).not.toContain(figure.altText)
    expect(calls).toBe(0)
    await page.getByRole('button', { name: '取消附带', exact: true }).click()
    await expect(selector).toHaveValue('')
    await expect(page.locator('.ai-context-preview')).toHaveCount(0)
    await selector.selectOption({ index: 1 })
    await expect(page.locator('.ai-context-preview pre')).toHaveText(preview)
    expect(calls).toBe(0)
    await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click()
    await expect(page.locator('.ai-answer')).toContainText('题目给定的条件')
    expect(calls).toBe(1)
    expect(payload).toContain(JSON.stringify(preview).slice(1, -1))
    expect(payload).not.toContain(fakeKey)
    expect(payload).not.toContain(JSON.stringify(question.answer).slice(1, -1))
    expect(payload).not.toContain(JSON.stringify(otherQuestion.prompt).slice(1, -1))
    for (const figure of figures.filter(figure => figure.week === week && figure.subject === 'physics')) expect(payload).not.toContain(JSON.stringify(figure.altText).slice(1, -1))
    expect(await page.evaluate(() => localStorage.getItem('xunxu.deepseek.api-key.v1'))).toBeNull()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: '问 AI', exact: true })).toBeFocused()
    await expectProgressUnchanged(page)
  })
}

for (const subject of subjects) {
  test(`week-eight ${subject} has one cumulative diagnostic and a closed review-only skill map with current-week navigation`, async ({ page }) => {
    test.setTimeout(90000)
    const lesson = lessonFor(8, subject)
    const review = normalizeReviewMap(readJson<unknown>(8, `assets/${subject}-review-map.json`), lesson)
    const skills = review.questions.flatMap(question => question.skills)
    const map = page.locator('.cumulative-review-map')
    const summary = map.locator('summary')
    expect(review.totalPoints).toBe(20)
    expect(review.questions.reduce((sum, question) => sum + question.points, 0)).toBe(20)
    expect([...new Set(skills.flatMap(skill => skill.weeks))].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    for (const step of ['prepare', 'diagnostic', lesson.sections[0]!.id, lesson.workedExamples[0]!.id, lesson.practice[0]!.id, 'quiz']) {
      await page.goto(`/#learn/8/${subject}/${step}`)
      await expect(map).toHaveCount(0)
    }
    await expect(page.locator('.focus-section-title')).toHaveText('20 分累计诊断')
    expect(lesson.quiz.questions).toHaveLength(4)
    await expect(page.locator('.focus-section .problem-card')).toHaveCount(lesson.quiz.questions.length)
    await expect(page.locator('.focus-section .problem-card details[open]')).toHaveCount(0)
    await expect(page.locator('.focus-section .problem-card details > summary').filter({ hasText: /^累计诊断完成后核对答案与评分点$/ })).toHaveCount(lesson.quiz.questions.length)
    await expect(page.locator('.focus-section')).toContainText('页面不提供自动评分')
    await expect(page.locator('.focus-section .static-lesson-figure')).toHaveCount(0)
    const firstAnswer = page.locator('.focus-section .problem-card details').first()
    await firstAnswer.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(firstAnswer).toHaveAttribute('open', '')
    await page.locator('.focus-directory > summary').click()
    await expect(page.locator('.focus-directory button').filter({ hasText: '20 分累计诊断' })).toHaveCount(1)
    await expect(page.locator('.focus-directory button').filter({ hasText: '分短测' })).toHaveCount(0)
    await page.locator('.focus-directory button').filter({ hasText: '订正与回顾' }).click()
    await expect(page).toHaveURL(new RegExp(`#learn/8/${subject}/review$`))
    await expect(map).toHaveCount(1)
    await expect(summary).toHaveText(reviewSummary)
    await expect(map).not.toHaveAttribute('open', '')
    await expect(map.locator('article').first()).not.toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`#learn/8/${subject}/quiz$`))
    await expect(firstAnswer).not.toHaveAttribute('open', '')
    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`#learn/8/${subject}/review$`))
    await expect(map).not.toHaveAttribute('open', '')
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(map).toHaveAttribute('open', '')
    await expect(map.locator('article')).toHaveCount(lesson.quiz.questions.length)
    await expect(map.locator('li')).toHaveCount(skills.length)
    await expect(map).toContainText(`20 分累计诊断的回查表，已计入原有 ${review.minutes} 分钟测评安排`)
    await expect(map).toContainText('不是额外试卷')
    await expect(map).toContainText('不重复加分')
    for (const skill of skills) await expect(map).toContainText(`${skill.skill} · ${skill.points} 分 · 关联第 ${skill.weeks.join('、')} 周`)
    const titles = new Map(lesson.sections.map(section => [section.title, section.id]))
    const buttons = map.getByRole('button')
    for (const label of await buttons.allTextContents()) expect(titles.has(label.replace(/^回看：/, '').replace(/ →$/, ''))).toBe(true)
    const firstTarget = skills[0]!.sectionIds[0]!
    const firstTitle = lesson.sections.find(section => section.id === firstTarget)!.title
    await map.getByRole('button', { name: `回看：${firstTitle} →`, exact: true }).first().focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`#learn/8/${subject}/${firstTarget}$`))
    await expect(page.locator('.focus-section-title')).toHaveText(firstTitle)
    await expect(page.locator('.focus-section-title')).toBeFocused()
    await expect(map).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`#learn/8/${subject}/review$`))
    await expect(map).not.toHaveAttribute('open', '')
    await summary.click()
    await page.reload()
    await expect(map).not.toHaveAttribute('open', '')
    await page.getByRole('button', { name: '← 退出专注', exact: true }).click()
    await expect(page.locator('.topbar')).toContainText('第 1 周')
    await expect(page.getByLabel('浏览学习周')).toHaveValue('8')
    await expectProgressUnchanged(page)
  })
}
