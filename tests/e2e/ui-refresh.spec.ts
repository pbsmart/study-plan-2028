import { test, expect, type Page } from '@playwright/test'
import { comesBefore, contrastAndType, keyboardFocusRing, noHorizontalOverflow, readableLesson, screenshot } from './ui-audit'

const pages = [
  ['overview', '学习概览'], ['roadmap', '学习路线'], ['subjects', '六科学习路径'],
  ['first', '首四周学习'], ['weekly', '学习周'], ['notebook', '笔记与错题'], ['settings', '设置与备份'],
] as const
const themes = [['light', '浅色'], ['dark', '深色']] as const
const api = 'https://api.deepseek.com/chat/completions'
const fakeKey = 'MOCK_DEEPSEEK_KEY_FOR_UI_TESTS_ONLY'
const unexpectedExternal = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page, baseURL }) => {
  const blocked: string[] = []; unexpectedExternal.set(page, blocked)
  const localOrigin = new URL(baseURL!).origin
  // A later, explicit API mock may fulfill the test request. Everything else stays local.
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === localOrigin) return route.continue()
    blocked.push(route.request().url()); return route.abort('blockedbyclient')
  })
  await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.reload()
})
test.afterEach(async ({ page }) => expect(unexpectedExternal.get(page)).toEqual([]))

async function setTheme(page: Page, label: string, value: string) {
  await page.goto('/#settings')
  await page.locator('.theme-options').getByRole('button', { name: label, exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', value)
  expect(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme)).toBe(value)
}

for (const [theme, label] of themes) {
  test(`${theme}: six-page semantic, task-first, contrast and screenshot matrix`, async ({ page }, info) => {
    test.setTimeout(90000)
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await setTheme(page, label, theme)
    for (const [id, title] of pages) {
      const link = page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: title })
      await link.click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
      const headingSize = await page.getByRole('heading', { level: 1 }).evaluate(el => parseFloat(getComputedStyle(el).fontSize))
      expect(headingSize).toBeGreaterThanOrEqual(24)
      expect(headingSize).toBeLessThanOrEqual(32)
      await expect(link).toHaveAttribute('aria-current', 'page')
      await expect(page.locator('main')).toHaveClass(`page-${id}`)
      await noHorizontalOverflow(page)
      await contrastAndType(page)
      if (id === 'overview') {
        await comesBefore(page.locator('.hero'), page.locator('.overview-records'))
        await comesBefore(page.locator('.course-grid'), page.locator('.overview-records'))
        await expect(page.locator('.hero .primary')).toHaveCount(1)
        await expect(page.locator('.hero .primary')).toContainText('继续第 1 周')
        await expect(page.locator('.coverage-details')).not.toHaveAttribute('open', '')
      }
      if (id === 'roadmap') {
        await expect(page.locator('.learning-week-row')).toHaveCount(84)
        await expect(page.locator('.week-detail[open]')).toHaveCount(0)
        await expect(page.locator('.route-current .primary')).toBeVisible()
      }
      if (id === 'weekly') {
        await comesBefore(page.locator('.study-entry'), page.locator('.week-management'))
        await comesBefore(page.locator('.study-entry'), page.locator('.record-section'))
        await expect(page.locator('.study-entry .primary')).toHaveCount(1)
        await expect(page.locator('.study-entry .primary')).toHaveText('开始专注学习 →')
      }
      // The 84-week route is deliberately viewport-only; other pages preserve the whole layout.
      await screenshot(page, info, `${theme}-${id}`, id !== 'roadmap')
    }
    await keyboardFocusRing(page, page.getByRole('button', { name: '导出 JSON 备份', exact: true }))
    expect(errors).toEqual([])
  })

  test(`${theme}: basic, enriched, practice and cumulative lesson screenshot matrix`, async ({ page }, info) => {
    test.setTimeout(90000)
    await setTheme(page, label, theme)
    const lessons = [
      ['basic-knowledge', '13/math/knowledge'], ['basic-practice', '13/math/practice'],
      ['enriched-knowledge', '1/math/w1-math-s1'], ['enriched-practice', '1/math/w1-math-pr1'],
      ['cumulative-quiz', '8/math/quiz'],
      ['basic-listening-material', '69/english/prepare'], ['basic-source-material', '60/chinese/prepare'],
      ['basic-diagnostic', '60/english/diagnostic'],
    ] as const
    for (const [name, route] of lessons) {
      await page.goto(`/#learn/${route}`)
      await expect(page.locator('.focus-section-title')).toBeFocused()
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.locator('.focus-section')).toHaveCount(1)
      await expect(page.locator('.sidebar, .record-section, .subject-tabs')).toHaveCount(0)
      await expect(page.locator('.focus-directory')).toHaveJSProperty('open', await page.evaluate(() => innerWidth >= 980))
      await expect(page.locator('.focus-source-details')).not.toHaveAttribute('open', '')
      await expect(page.getByRole('button', { name: '这一步没懂', exact: true })).not.toHaveClass(/primary/)
      await expect(page.locator('.focus-pagination .primary')).toHaveCount(1)
      await noHorizontalOverflow(page)
      await readableLesson(page)
      await contrastAndType(page, '.focus-scope, .focus-section .math-text, .focus-section .help, .focus-checkpoint small')
      await screenshot(page, info, `${theme}-${name}`)
      const solution = page.locator('.focus-section .problem-answer').first()
      if (await solution.count()) {
        await expect(solution).not.toHaveAttribute('open', '')
        await solution.locator('summary').focus(); await page.keyboard.press('Enter')
        await expect(solution).toHaveAttribute('open', '')
        await expect(solution.locator('.solution')).toBeVisible()
        await noHorizontalOverflow(page)
        await readableLesson(page)
        await screenshot(page, info, `${theme}-${name}-solution`)
      }
    }
    await keyboardFocusRing(page, page.getByRole('button', { name: '这一步没懂', exact: true }))
    await page.locator('.focus-directory > summary').focus(); await page.keyboard.press('Enter')
    await expect(page.locator('.focus-directory')).toHaveAttribute('open', '')
    await page.locator('.focus-directory button').first().focus(); await page.keyboard.press('Enter')
    await expect(page.locator('.focus-section-title')).toBeFocused()
    await expect(page.locator('.focus-directory')).toHaveJSProperty('open', await page.evaluate(() => innerWidth >= 980))
    await page.getByRole('button', { name: '← 退出专注', exact: true }).click()
    await expect(page.locator('.start-focus')).toBeFocused()
  })

  test(`${theme}: AI composer, privacy, complete preview and mocked history screenshot matrix`, async ({ page }, info) => {
    test.setTimeout(90000)
    const requests: { messages: { role: string; content: string }[] }[] = []
    await page.route(api, async route => {
      requests.push(route.request().postDataJSON())
      await route.fulfill({ json: { choices: [{ message: { content: `UI 测试回答 ${requests.length}：先独立尝试，再按条件分步分析。` }, finish_reason: 'stop' }] } })
    })
    await setTheme(page, label, theme)
    await page.goto('/#learn/13/math/knowledge')
    const studyBefore = await page.evaluate(() => localStorage.getItem('xunxu.gaokao.v1'))
    await page.getByRole('button', { name: '这一步没懂', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'AI 问答' })
    await expect(dialog).toBeVisible()
    const question = page.getByLabel('你的问题')
    await expect(question).toBeFocused()
    expect(await question.evaluate(el => (el as HTMLTextAreaElement).form?.id)).toBe('learning-ai-form')
    await expect(page.getByRole('button', { name: '发送给 DeepSeek', exact: true })).toBeDisabled()
    await expect(page.locator('.ai-settings')).toHaveAttribute('open', '')
    await expect(page.getByLabel('DeepSeek API Key', { exact: true })).toHaveAttribute('type', 'password')
    await expect(page.getByRole('button', { name: '保存 Key', exact: true })).toBeDisabled()
    await expect(page.locator('.ai-request-details')).not.toHaveAttribute('open', '')
    await comesBefore(page.locator('.ai-question-panel'), page.locator('.ai-composer'))
    await comesBefore(page.locator('.ai-composer'), page.locator('.ai-conversation-section'))
    await noHorizontalOverflow(page)
    await contrastAndType(page, '.learning-ai-dialog .ai-note:not(.ai-footer):not(.ai-send-row > .ai-note), .learning-ai-dialog .ai-consent')
    await screenshot(page, info, `${theme}-ai-key-question`, false)

    await page.getByLabel('DeepSeek API Key', { exact: true }).fill(fakeKey)
    await page.locator('.ai-settings > summary').click()
    await expect(page.locator('.ai-settings')).not.toHaveAttribute('open', '')
    await keyboardFocusRing(page, page.locator('.ai-settings > summary'))
    const keyFocus = await page.locator('.ai-settings > summary').evaluate(el => {
      const style = getComputedStyle(el), parent = getComputedStyle(el.parentElement!)
      return { offset: parseFloat(style.outlineOffset), width: parseFloat(style.outlineWidth), clipped: parent.overflowX === 'hidden' || parent.overflowY === 'hidden' }
    })
    if (keyFocus.clipped) expect(keyFocus.offset + keyFocus.width, 'the closed Key disclosure focus ring must fit inside its clipping parent').toBeLessThanOrEqual(0)
    await page.getByLabel('附带的学习资料（可选）').selectOption({ index: 1 })
    await question.fill('请先给我提示，不要直接代做。')
    await page.locator('.ai-request-details > summary').click()
    const preview = await page.locator('.ai-request-details article pre').allTextContents()
    await expect(page.locator('.ai-send-summary')).toContainText('0 轮历史')
    expect(requests).toHaveLength(0)
    await contrastAndType(page, '.ai-send-summary, .ai-consent')
    await noHorizontalOverflow(page)
    await page.locator('.ai-history-preview').scrollIntoViewIfNeeded()
    await screenshot(page, info, `${theme}-ai-send-preview`, false)
    await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click()
    await expect(page.locator('.ai-answer')).toContainText('UI 测试回答 1')
    expect(await page.locator('.ai-answer pre').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.messages.map(message => message.content)).toEqual(preview)
    expect(JSON.stringify(requests)).not.toContain(fakeKey)
    await expect(question).toHaveValue('')
    await expect(page.getByRole('button', { name: '发送给 DeepSeek', exact: true })).toBeDisabled()
    await noHorizontalOverflow(page)
    await page.locator('.ai-answer').scrollIntoViewIfNeeded()
    await screenshot(page, info, `${theme}-ai-answer`, false)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: '这一步没懂', exact: true })).toBeFocused()
    expect(await page.evaluate(() => localStorage.getItem('xunxu.gaokao.v1'))).toBe(studyBefore)
    expect(await page.evaluate(() => localStorage.getItem('xunxu.deepseek.api-key.v1'))).toBeNull()
  })
}

test('320 CSS px reflow retains the course, expanded answers, settings and AI controls', async ({ page }, info) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 320, height: 800 })
  for (const [theme, label] of themes) {
    await setTheme(page, label, theme)
    for (const [id] of pages) {
      await page.goto(`/#${id}`)
      await expect(page.locator(`main.page-${id}`)).toBeVisible()
      await noHorizontalOverflow(page)
    }
    await page.goto('/#learn/7/physics/w7-physics-ex4')
    await expect(page.locator('.focus-section .problem-answer')).toBeVisible()
    await page.locator('.focus-section .problem-answer > summary').click()
    await expect(page.locator('.focus-section .static-lesson-figure')).toBeVisible()
    const figureViewport = page.locator('.focus-section .static-figure-image')
    await keyboardFocusRing(page, figureViewport)
    expect(await figureViewport.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => figureViewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
    await noHorizontalOverflow(page)
    await screenshot(page, info, `${theme}-320-answer-figure`)
    await page.getByRole('button', { name: '这一步没懂', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'AI 问答' })).toBeVisible()
    await noHorizontalOverflow(page)
    const innerOverflow = await page.locator('.learning-ai-dialog').evaluate(el => el.scrollWidth > el.clientWidth + 1)
    expect(innerOverflow).toBe(false)
    await screenshot(page, info, `${theme}-320-ai`, false)
    await page.keyboard.press('Escape')
  }
})
