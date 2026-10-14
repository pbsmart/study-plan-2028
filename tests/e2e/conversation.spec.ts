import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const api = 'https://api.deepseek.com/chat/completions'
const fakeKey = 'MOCK_DEEPSEEK_KEY_FOR_TESTS_ONLY'
type Payload = { messages: { role: string; content: string }[] }
const response = (answer: string) => ({ choices: [{ message: { content: answer }, finish_reason: 'stop' }] })
async function open(page: Page) { await page.getByRole('button', { name: '问 AI', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'AI 问答' })).toBeVisible() }
async function fillKey(page: Page) { const details = page.locator('.ai-settings'); if (!await details.evaluate(el => (el as HTMLDetailsElement).open)) await details.locator('summary').click(); await page.getByLabel('DeepSeek API Key', { exact: true }).fill(fakeKey) }
async function send(page: Page, question: string, answer: string) { await page.getByLabel('你的问题').fill(question); await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click(); await expect(page.locator('.ai-answer')).toContainText(answer) }
async function close(page: Page) { await page.getByRole('button', { name: '关闭 AI 问答', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0) }
test.beforeEach(async ({ page }) => { await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.goto('/#learn/13/math/knowledge') })

test('follow-ups send the visible complete pairs and prior material, without automatic calls', async ({ page }) => {
  const payloads: Payload[] = []
  await page.route(api, async route => { payloads.push(route.request().postDataJSON()); await route.fulfill({ json: response(`答案${payloads.length} <img src=x onerror=alert(1)>`) }) })
  await open(page); await fillKey(page); await page.getByLabel('附带的学习资料（可选）').selectOption({ index: 1 })
  const originalMaterial = await page.locator('.ai-context-preview pre').innerText()
  await send(page, 'PRIVATE FIRST QUESTION', '答案1'); await page.getByRole('button', { name: '取消附带', exact: true }).click()
  await page.getByLabel('你的问题').fill('请接着解释第二步')
  await expect(page.locator('.ai-send-summary')).toContainText('1 轮历史'); await expect(page.locator('.ai-send-summary')).toContainText('第 1 轮')
  await page.locator('.ai-request-details > summary').click()
  await expect(page.locator('.ai-request-details')).toContainText(originalMaterial)
  expect(payloads).toHaveLength(1)
  const preview = await page.locator('.ai-request-details article pre').allTextContents()
  await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click(); await expect(page.locator('.ai-answer')).toContainText('答案2')
  expect(payloads[1]!.messages.map(message => message.content)).toEqual(preview)
  expect(payloads[1]!.messages.map(message => message.role)).toEqual(['system', 'user', 'assistant', 'user'])
  await expect(page.locator('.ai-turn img')).toHaveCount(0)
  await page.getByLabel('附带本课最近的完整问答').uncheck(); await expect(page.locator('.ai-send-summary')).toContainText('0 轮历史')
  await send(page, '这次单独问', '答案3'); expect(payloads[2]!.messages).toHaveLength(2)
  expect(JSON.stringify(payloads[2])).not.toContain('PRIVATE FIRST QUESTION')
})

test('same-course section changes and reopening restore memory; other courses are isolated; refresh clears', async ({ page }) => {
  const payloads: Payload[] = []
  await page.route(api, async route => { payloads.push(route.request().postDataJSON()); await route.fulfill({ json: response(`课内答案${payloads.length}`) }) })
  await open(page); await fillKey(page); await send(page, '数学第十三周唯一问题', '课内答案1'); await close(page)
  await open(page); await expect(page.locator('.ai-answer')).toContainText('数学第十三周唯一问题'); await close(page)
  await page.getByRole('button', { name: '下一节 →', exact: true }).click(); await open(page)
  await expect(page.locator('.ai-answer')).toContainText('数学第十三周唯一问题'); await expect(page.getByLabel('附带的学习资料（可选）')).toHaveValue('')
  await close(page); await page.goto('/#learn/14/math/knowledge'); await open(page); await expect(page.locator('.ai-turn')).toHaveCount(0)
  await fillKey(page); await send(page, '数学第十四周唯一问题', '课内答案2'); expect(payloads[1]!.messages).toHaveLength(2)
  await close(page); await page.goto('/#learn/13/physics/knowledge'); await open(page); await expect(page.locator('.ai-turn')).toHaveCount(0)
  await close(page); await page.goto('/#learn/13/math/knowledge'); await open(page); await expect(page.locator('.ai-answer')).toContainText('数学第十三周唯一问题')
  expect(payloads).toHaveLength(2); await page.reload(); await open(page); await expect(page.locator('.ai-turn')).toHaveCount(0)
})

test('request preview clips to recent six complete pairs and reports omitted rounds', async ({ page }) => {
  const payloads: Payload[] = []
  await page.route(api, async route => { payloads.push(route.request().postDataJSON()); await route.fulfill({ json: response(`短回答${payloads.length}`) }) })
  await open(page); await fillKey(page)
  for (let index = 1; index <= 8; index++) await send(page, `问题编号${index}`, `短回答${index}`)
  await expect(page.locator('.ai-send-summary')).toContainText('6 轮历史'); await expect(page.locator('.ai-send-summary')).toContainText('第 3、4、5、6、7、8 轮')
  await expect(page.locator('.ai-omitted-history')).toContainText('2 轮历史本次未附带')
  await send(page, '预算裁剪后继续', '短回答9')
  expect(payloads[8]!.messages).toHaveLength(14)
  const content = payloads[8]!.messages.map(message => message.content).join('\n')
  expect(content).not.toContain('问题编号1'); expect(content).not.toContain('问题编号2'); expect(content).toContain('问题编号3')
})

test('large answers trigger character budget without splitting the newest pair', async ({ page }) => {
  const payloads: Payload[] = []
  await page.route(api, async route => { payloads.push(route.request().postDataJSON()); await route.fulfill({ json: response(`长回答${payloads.length} ${'x'.repeat(17000)}`) }) })
  await open(page); await fillKey(page); await send(page, '第一长问题', '长回答1'); await send(page, '第二长问题', '长回答2')
  await expect(page.locator('.ai-send-summary')).toContainText('1 轮历史'); await expect(page.locator('.ai-send-summary')).toContainText('第 2 轮')
  await expect(page.locator('.ai-omitted-history')).toContainText('1 轮历史本次未附带')
  await send(page, '第三问题', '长回答3')
  expect(payloads[2]!.messages.map(message => message.role)).toEqual(['system', 'user', 'assistant', 'user'])
  expect(payloads[2]!.messages.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(32000)
})

test('failed/cancelled/closed requests add no history and clearing rejects late results', async ({ page }) => {
  let mode = 'success', slowSettled = 0; const payloads: Payload[] = []
  await page.route(api, async route => { payloads.push(route.request().postDataJSON()); const currentMode = mode; if (currentMode === 'slow') await new Promise(resolve => setTimeout(resolve, 1200)); await route.fulfill(currentMode === 'error' ? { status: 429, json: { error: 'not retained' } } : { json: response(currentMode === 'slow' ? 'LATE RESULT MUST NOT SURVIVE' : `成功回答${payloads.length}`) }).catch(() => {}); if (currentMode === 'slow') slowSettled++ })
  await open(page); await fillKey(page); await send(page, '已有成功问题', '成功回答1')
  mode = 'error'; await page.getByLabel('你的问题').fill('失败问题'); await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('429'); await expect(page.locator('.ai-turn')).toHaveCount(1)
  mode = 'success'; await send(page, '重试问题', '成功回答3'); expect(JSON.stringify(payloads[2])).not.toContain('失败问题')
  mode = 'slow'; await page.getByLabel('你的问题').fill('取消问题'); await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click(); await expect.poll(() => payloads.length).toBe(4)
  await page.getByRole('button', { name: '取消请求', exact: true }).click(); await expect(page.locator('.ai-turn')).toHaveCount(2)
  await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click(); await expect.poll(() => payloads.length).toBe(5); await close(page); await open(page); await expect(page.locator('.ai-turn')).toHaveCount(2)
  await fillKey(page); await page.getByLabel('你的问题').fill('清空在途'); await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click(); await expect.poll(() => payloads.length).toBe(6)
  await page.getByRole('button', { name: '清空当前会话', exact: true }).click(); await expect(page.locator('.ai-turn')).toHaveCount(0)
  mode = 'success'; await send(page, '清空后新问题', '成功回答7'); expect(payloads[6]!.messages).toHaveLength(2)
  await expect.poll(() => slowSettled).toBe(3)
  await expect(page.locator('.ai-turn')).toHaveCount(1); await expect(page.locator('.ai-answer')).not.toContainText('LATE RESULT')
})

test('switching courses aborts in-flight requests and backup excludes conversations and key', async ({ page }) => {
  const payloads: Payload[] = []; let slow = false, slowSettled = 0
  await page.route(api, async route => { payloads.push(route.request().postDataJSON()); const requestWasSlow = slow; if (requestWasSlow) await new Promise(resolve => setTimeout(resolve, 1200)); await route.fulfill({ json: response('PRIVATE ANSWER NOT IN BACKUP') }).catch(() => {}); if (requestWasSlow) slowSettled++ })
  await open(page); await fillKey(page); await page.getByLabel('我了解风险，同意将 Key 保存到当前浏览器').check(); await page.getByRole('button', { name: '保存 Key', exact: true }).click()
  await send(page, 'PRIVATE QUESTION NOT IN BACKUP', 'PRIVATE ANSWER')
  slow = true; await page.getByLabel('你的问题').fill('跨课取消问题'); await page.getByRole('button', { name: '发送给 DeepSeek', exact: true }).click(); await expect.poll(() => payloads.length).toBe(2)
  await page.evaluate(() => { location.hash = '#learn/14/math/knowledge' }); await expect(page.getByRole('dialog')).toHaveCount(0); await open(page); await expect(page.locator('.ai-turn')).toHaveCount(0)
  await close(page); await page.goto('/#learn/13/math/knowledge'); await open(page); await expect.poll(() => slowSettled).toBe(1); await expect(page.locator('.ai-turn')).toHaveCount(1)
  await close(page); await page.goto('/#settings'); const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON 备份', exact: true }).click()
  const text = await readFile((await (await download).path())!, 'utf8')
  for (const value of [fakeKey, 'PRIVATE QUESTION', 'PRIVATE ANSWER', '跨课取消问题']) expect(text).not.toContain(value)
  const stored = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([key]) => key !== 'xunxu.deepseek.api-key.v1'))))
  expect(stored).not.toContain('PRIVATE QUESTION'); expect(stored).not.toContain('PRIVATE ANSWER')
})
