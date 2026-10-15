import { test, expect } from '@playwright/test'
test.beforeEach(async ({ page }) => { await page.goto('/'); await page.evaluate(() => localStorage.clear()) })

test('approved course layout uses a blue desktop outline, a collapsed mobile outline and continuous content', async ({ page }, info) => {
  await page.goto('/#learn/1/physics/w1-physics-s5')
  await expect(page.locator('.focus-section-title')).toBeVisible()
  const mobile = info.project.name === 'mobile'
  if (mobile) await expect(page.locator('.focus-directory')).not.toHaveAttribute('open', '')
  else {
    await expect(page.locator('.focus-directory')).toHaveAttribute('open', '')
    const box = await page.locator('.course-outline').boundingBox(); expect(box!.width).toBeLessThan(260)
    await expect(page.locator('.outline-group h2')).toHaveText(['学习准备', '讲解', '例题', '独立练习', '测评与订正'])
  }
  await expect(page.locator('.lesson-podcast')).toContainText('Dylan / Serena')
  await expect(page.getByRole('button', { name: '这一步没懂', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/redesign-${info.project.name}-course.png`, fullPage: true })
})

test('open-ended exercise requires an attempt and reveals a self-check without invented grading', async ({ page }, info) => {
  await page.goto('/#learn/1/physics/w1-physics-pr3')
  await expect(page.locator('.problem-answer')).not.toHaveAttribute('open', '')
  await page.getByRole('button', { name: '检查答案', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('先写下你的作答')
  await expect(page.locator('.problem-answer')).not.toHaveAttribute('open', '')
  await page.getByRole('button', { name: '看提示', exact: true }).click()
  await expect(page.locator('.practice-hint')).toBeVisible()
  await page.getByLabel('你的作答', { exact: true }).fill('我暂时认为路程是7米，位移是0。')
  await page.screenshot({ path: `test-results/redesign-${info.project.name}-practice.png`, fullPage: true })
  await page.getByRole('button', { name: '检查答案', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('不自动判分')
  await expect(page.locator('.problem-answer')).toHaveAttribute('open', '')
  await expect(page.getByRole('group', { name: '核对后自评（不会自动打卡）' })).toBeVisible()
  await page.getByLabel('需要订正后再练', { exact: true }).check()
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('xunxu.gaokao.v1') || '{}'))
  expect(Object.values(data.weeks || {}).every((week: any) => week.completed.length === 0)).toBe(true)
})

test('basic practice and enhanced quizzes show one question at a time and close solutions on switching', async ({ page }) => {
  for (const route of ['/#learn/13/math/practice', '/#learn/1/physics/quiz']) {
    await page.goto(route)
    await expect(page.locator('.problem-card:visible')).toHaveCount(1)
    const first = page.locator('.problem-card:visible')
    await first.locator('.problem-answer summary').click()
    await expect(first.locator('.problem-answer')).toHaveAttribute('open', '')
    await page.getByRole('button', { name: '下一题', exact: true }).click()
    await expect(page.locator('.problem-card:visible')).toHaveCount(1)
    await expect(page.locator('.problem-card:visible .problem-answer')).not.toHaveAttribute('open', '')
    await page.getByRole('button', { name: '上一题', exact: true }).click()
    await expect(page.locator('.problem-card:visible .problem-answer')).not.toHaveAttribute('open', '')
  }
})

test('help keeps the existing private AI flow and returns focus to its new entry', async ({ page }) => {
  await page.goto('/#learn/1/physics/w1-physics-pr3')
  await page.getByRole('button', { name: '这一步没懂', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'AI 问答' })).toBeVisible()
  await expect(page.locator('.ai-request-details')).not.toHaveAttribute('open', '')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '这一步没懂', exact: true })).toBeFocused()
})

test('notes and manually marked corrections persist independently and link back to the course', async ({ page }, info) => {
  await page.goto('/#learn/1/physics/w1-physics-pr3')
  await page.locator('.note-editor > summary').click()
  await page.getByLabel('记录自己的理解、卡点或订正', { exact: true }).fill('回到起点时位移为零，路程仍要逐段累加。')
  await page.getByLabel('加入待订正列表（自行标记）', { exact: true }).check()
  await page.getByRole('button', { name: '保存这一步笔记', exact: true }).click()
  await page.getByRole('link', { name: '查看全部笔记与错题 →', exact: true }).click()
  await expect(page.locator('.notebook-item')).toContainText('回到起点时位移为零')
  await page.reload()
  await expect(page.locator('.notebook-item')).toContainText('待订正')
  await page.getByLabel('笔记筛选', { exact: true }).selectOption('review')
  await page.getByRole('button', { name: '标记已订正', exact: true }).click()
  await expect(page.locator('.notebook-empty')).toContainText('还没有自行标记')
  await page.getByLabel('笔记筛选', { exact: true }).selectOption('all')
  await page.screenshot({ path: `test-results/redesign-${info.project.name}-notebook.png`, fullPage: true })
  await page.locator('.notebook-item h2 a').click()
  await expect(page).toHaveURL(/#learn\/1\/physics\/w1-physics-pr3$/)
  await page.locator('.note-editor > summary').click()
  await expect(page.getByLabel('记录自己的理解、卡点或订正', { exact: true })).toHaveValue('回到起点时位移为零，路程仍要逐段累加。')
  await expect(page.locator('.focus-checkpoint input')).toHaveCount(0)
})
