import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const fakeKey = 'MOCK_DEEPSEEK_KEY_FOR_TESTS_ONLY'
const api = 'https://api.deepseek.com/chat/completions'
const keySlot = 'xunxu.deepseek.api-key.v1'
const studySlot = 'xunxu.gaokao.v1'
const success = { choices: [{ message: { content: '先观察条件，再分两种情况。\n<img src=x onerror="window.__aiXss=true">' }, finish_reason: 'stop' }] }

async function open(page: Page) { await page.getByRole('button', { name: '问 AI', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'AI 问答' })).toBeVisible() }
async function fillKey(page: Page) { const details = page.locator('.ai-settings'); if (!await details.evaluate(el => (el as HTMLDetailsElement).open)) await details.locator('summary').click(); await page.getByLabel('DeepSeek API Key', { exact: true }).fill(fakeKey) }
test.beforeEach(async ({ page }) => { await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.goto('/#learn/9/math/knowledge') })

test('does no API work until an explicit send; selected context and answer stay safe', async ({ page }, info) => {
  const requests: { body: Record<string, unknown>; headers: Record<string, string> }[] = []
  const logs: string[] = []; page.on('console', msg => logs.push(msg.text())); page.on('pageerror', error => logs.push(error.message))
  await page.route(api, async route => { requests.push({ body: route.request().postDataJSON(), headers: route.request().headers() }); await route.fulfill({ json: success }) })
  const before = await page.evaluate(slot => localStorage.getItem(slot), studySlot)
  await expect(page.getByRole('dialog')).toHaveCount(0); await open(page)
  await expect(page.getByLabel('你的问题')).toBeFocused()
  await expect(page.getByLabel('DeepSeek API Key', { exact: true })).toHaveAttribute('type', 'password')
  await expect(page.getByRole('button', { name: '保存 Key', exact: true })).toBeDisabled()
  await fillKey(page); await page.getByLabel('你的问题').fill('请先给我提示')
  const selector = page.getByLabel('附带的学习资料（可选）')
  await expect(selector).toHaveValue(''); await selector.selectOption({ index: 1 })
  const preview = await page.locator('.ai-context-preview pre').innerText()
  await expect(page.locator('.ai-context-preview')).toBeVisible(); expect(requests).toHaveLength(0)
  await page.getByRole('button', { name: '取消附带', exact: true }).click(); await expect(page.locator('.ai-context-preview')).toHaveCount(0)
  await selector.selectOption({ index: 1 }); await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click()
  await expect(page.locator('.ai-answer')).toContainText('先观察条件')
  expect(requests).toHaveLength(1); expect(requests[0]!.body).toMatchObject({ model: 'deepseek-flash', stream: false, thinking: { type: 'disabled' } })
  const payload = JSON.stringify(requests[0]!.body)
  expect(payload).toContain(JSON.stringify(preview).slice(1, -1)); expect(payload).not.toContain(fakeKey)
  expect(requests[0]!.headers.authorization).toBe(`Bearer ${fakeKey}`)
  expect(requests[0]!.headers.referer).toBeUndefined()
  await expect(page.locator('.ai-answer img')).toHaveCount(0)
  expect(await page.evaluate(() => '__aiXss' in window)).toBe(false)
  expect(await page.evaluate(slot => localStorage.getItem(slot), studySlot)).toBe(before)
  expect(await page.evaluate(slot => localStorage.getItem(slot), keySlot)).toBeNull()
  expect(logs.join('\n')).not.toContain(fakeKey)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/deepseek-${info.project.name}-answer.png`, fullPage: true })
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByRole('button', { name: '问 AI', exact: true })).toBeFocused()
  await open(page); await expect(page.getByLabel('DeepSeek API Key', { exact: true })).toHaveValue(''); await expect(page.locator('.ai-answer')).toContainText('先观察条件')
  expect(requests).toHaveLength(1)
})

test('explicit save persists only the key, excludes backup, and clear removes it', async ({ page }) => {
  let calls = 0; await page.route(api, async route => { calls++; await route.fulfill({ json: success }) })
  await open(page); await fillKey(page)
  await page.getByLabel('我了解风险，同意将 Key 保存到当前浏览器').check(); await page.getByRole('button', { name: '保存 Key', exact: true }).click()
  await expect(page.getByText('已保存到当前浏览器。保存不会连接 DeepSeek。')).toBeVisible()
  await page.reload(); await open(page); await page.locator('.ai-settings summary').click()
  await expect(page.getByLabel('DeepSeek API Key', { exact: true })).toHaveValue(fakeKey)
  await page.getByRole('button', { name: '关闭 AI 问答', exact: true }).click(); await page.goto('/#settings')
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON 备份', exact: true }).click()
  const file = await downloadEvent; const content = await readFile((await file.path())!, 'utf8')
  expect(content).not.toContain(fakeKey); expect(content).not.toContain(keySlot); expect(JSON.parse(content).version).toBe(2)
  await page.goto('/#learn/9/math/knowledge'); await open(page); await page.locator('.ai-settings summary').click()
  await page.getByRole('button', { name: '清除 Key', exact: true }).click(); await expect(page.getByLabel('DeepSeek API Key', { exact: true })).toHaveValue('')
  expect(await page.evaluate(slot => localStorage.getItem(slot), keySlot)).toBeNull(); expect(calls).toBe(0)
})

test('handles 401, 429, network failure, retry and no history retransmission', async ({ page }) => {
  const bodies: string[] = []; let response = 401
  await page.route(api, async route => { bodies.push(route.request().postData() || ''); if (response === 0) await route.abort('failed'); else await route.fulfill({ status: response, json: response === 200 ? success : { error: { message: `NEVER SHOW ${fakeKey}` } } }) })
  await open(page); await fillKey(page); await page.getByLabel('你的问题').fill('第一次问题')
  await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('401/403')
  expect(await page.getByRole('dialog').innerText()).not.toContain(fakeKey); expect(bodies).toHaveLength(1)
  response = 429; await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('429')
  response = 0; await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('CORS')
  response = 200; await page.getByLabel('你的问题').fill('第二次问题'); await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click()
  await expect(page.locator('.ai-answer')).toContainText('先观察条件'); expect(bodies).toHaveLength(4); expect(bodies[3]).not.toContain('第一次问题')
})

test('cancel, close, and navigation abort pending work without duplicate submissions or stale answers', async ({ page }) => {
  let requests = 0
  await page.route(api, async route => { requests++; await new Promise(resolve => setTimeout(resolve, 1200)); await route.fulfill({ json: success }).catch(() => {}) })
  await open(page); await fillKey(page); await page.getByLabel('你的问题').fill('等待测试')
  await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click(); await expect.poll(() => requests).toBe(1); await expect(page.getByRole('button', { name: '正在等待回答…', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '取消请求', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('已取消本地等待')
  await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click(); await expect.poll(() => requests).toBe(2); await page.getByRole('button', { name: '关闭 AI 问答', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0); await open(page); await expect(page.locator('.ai-answer')).toHaveCount(0)
  await fillKey(page); await page.getByLabel('你的问题').fill('切页测试'); await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click(); await expect.poll(() => requests).toBe(3)
  await page.evaluate(() => { location.hash = '#learn/9/math/practice' }); await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.focus-section-title')).toBeFocused(); await open(page); await expect(page.locator('.ai-answer')).toHaveCount(0)
  await expect(page.getByLabel('附带的学习资料（可选）')).toHaveValue(''); expect(requests).toBe(3)
})

test('enhanced quizzes attach only one selected prompt and work in dark mode', async ({ page }, info) => {
  let body = ''
  await page.route(api, async route => { body = route.request().postData() || ''; await route.fulfill({ json: success }) })
  await page.goto('/#settings'); await page.locator('.theme-options').getByRole('button', { name: '深色', exact: true }).click(); await page.goto('/#learn/4/math/quiz')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const firstPrompt = await page.locator('.focus-section .problem-prompt').first().innerText()
  const secondPrompt = await page.locator('.focus-section .problem-prompt').nth(1).innerText()
  await open(page); await fillKey(page); await page.getByLabel('附带的学习资料（可选）').selectOption({ index: 1 })
  await expect(page.locator('.ai-context-preview')).toContainText(firstPrompt)
  expect(await page.locator('.ai-context-preview pre').innerText()).not.toContain(secondPrompt)
  await page.getByLabel('你的问题').fill('这道题从哪里开始？'); await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click(); await expect(page.locator('.ai-answer')).toBeVisible()
  expect(body).toContain(JSON.stringify(firstPrompt).slice(1, -1)); expect(body).not.toContain(JSON.stringify(secondPrompt).slice(1, -1))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/deepseek-${info.project.name}-dark.png`, fullPage: true })
})

test('blocked browser storage gives an honest fallback without an API request', async ({ page }) => {
  let requests = 0; await page.route(api, async route => { requests++; await route.fulfill({ json: success }) })
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key === 'xunxu.deepseek.api-key.v1') throw new DOMException('blocked', 'QuotaExceededError'); return original.call(this, key, value) } })
  await open(page); await fillKey(page); await page.getByLabel('我了解风险，同意将 Key 保存到当前浏览器').check(); await page.getByRole('button', { name: '保存 Key', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('保存失败'); expect(requests).toBe(0)
})
