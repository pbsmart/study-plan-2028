import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'

export async function screenshot(page: Page, info: TestInfo, name: string, fullPage = true) {
  const path = info.outputPath(`ui-${info.project.name}-${name}.png`)
  await page.screenshot({ path, fullPage, animations: 'disabled' })
  await info.attach(name, { path, contentType: 'image/png' })
}

export async function noHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }))
  expect(result.document, JSON.stringify(result)).toBeLessThanOrEqual(result.viewport + 1)
  expect(result.body, JSON.stringify(result)).toBeLessThanOrEqual(result.viewport + 1)
}

export async function comesBefore(first: Locator, second: Locator) {
  const firstBox = await first.boundingBox(), secondBox = await second.boundingBox()
  expect(firstBox).not.toBeNull(); expect(secondBox).not.toBeNull()
  expect(firstBox!.y + firstBox!.height).toBeLessThanOrEqual(secondBox!.y + 1)
}

export async function selectQuestionFor(page: Page, target: Locator) {
  if (await target.count() !== 1) return
  const number = await target.evaluate(element => {
    const card = element.closest('.problem-card')
    if (!card?.parentElement?.classList.contains('problem-sequence')) return 0
    return Array.from(card.parentElement.querySelectorAll(':scope > .problem-card')).indexOf(card) + 1
  })
  if (number) await page.getByRole('button', { name: `第 ${number} 题`, exact: true }).click()
}

// Measure rendered/composited colors, rather than assuming a token is used by a control.
// Native checkboxes are covered by their existing keyboard/checkoff tests and screenshots;
// text fields, selects, textareas and enabled primary buttons need a visible ≥3:1 boundary.
export async function contrastAndType(page: Page, textSelector = 'main .subtitle, main .help, main .note p') {
  const report = await page.evaluate(({ textSelector }) => {
    type Color = [number, number, number, number]
    const color = (value: string): Color => {
      const parts = value.match(/[\d.]+/g)?.map(Number) || []
      if (parts.length < 3) throw new Error(`Unsupported computed color: ${value}`)
      return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1]
    }
    const over = (front: Color, back: Color): Color => [front[0] * front[3] + back[0] * (1 - front[3]), front[1] * front[3] + back[1] * (1 - front[3]), front[2] * front[3] + back[2] * (1 - front[3]), 1]
    const background = (element: Element | null): Color => element ? over(color(getComputedStyle(element).backgroundColor), background(element.parentElement)) : [255, 255, 255, 1]
    const luminance = (value: Color) => value.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, index) => sum + n * [.2126, .7152, .0722][index]!, 0)
    const contrast = (a: Color, b: Color) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
    const visible = (element: Element) => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && element.getBoundingClientRect().width > 0
    const texts = [...document.querySelectorAll(textSelector)].filter(visible).map(element => {
      const style = getComputedStyle(element), bg = background(element)
      return { label: `${element.className}: ${element.textContent?.slice(0, 40)}`, ratio: contrast(over(color(style.color), bg), bg), size: parseFloat(style.fontSize) }
    })
    const controls = [...document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]), select, textarea, button.primary')].filter(visible).filter(element => !(element as HTMLInputElement).disabled).map(element => {
      const style = getComputedStyle(element), outside = background(element.parentElement), inside = background(element)
      const border = parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none' ? contrast(over(color(style.borderTopColor), outside), outside) : 1
      return { label: `${element.tagName}: ${element.getAttribute('aria-label') || element.getAttribute('name') || element.textContent?.slice(0, 40)}`, ratio: Math.max(border, contrast(inside, outside)), textRatio: contrast(over(color(style.color), inside), inside), size: parseFloat(style.fontSize), height: element.getBoundingClientRect().height }
    })
    const placeholders = [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].filter(visible).map(element => {
      const style = getComputedStyle(element, '::placeholder'), bg = background(element), foreground = color(style.color)
      foreground[3] *= parseFloat(style.opacity)
      return { label: element.getAttribute('placeholder'), ratio: contrast(over(foreground, bg), bg) }
    })
    const root = getComputedStyle(document.documentElement)
    const grayscale = ['--bg', '--surface', '--soft', '--text', '--muted', '--ink', '--inverse', '--control-border'].map(token => {
      const node = document.createElement('span'); node.style.color = root.getPropertyValue(token); document.body.append(node)
      const resolved = color(getComputedStyle(node).color); node.remove()
      return { token, value: root.getPropertyValue(token).trim(), spread: Math.max(...resolved.slice(0, 3)) - Math.min(...resolved.slice(0, 3)) }
    })
    return { texts, controls, placeholders, grayscale }
  }, { textSelector })
  for (const item of report.texts) {
    expect(item.ratio, `${item.label}: text contrast`).toBeGreaterThanOrEqual(4.5)
    expect(item.size, `${item.label}: supporting text size`).toBeGreaterThanOrEqual(13)
  }
  for (const item of report.controls) {
    expect(item.ratio, `${item.label}: required control boundary`).toBeGreaterThanOrEqual(3)
    expect(item.textRatio, `${item.label}: control text contrast`).toBeGreaterThanOrEqual(4.5)
    expect(item.height, `${item.label}: touch target`).toBeGreaterThanOrEqual(44)
    if (!item.label.startsWith('BUTTON')) expect(item.size, `${item.label}: input text size`).toBeGreaterThanOrEqual(16)
  }
  for (const item of report.placeholders) expect(item.ratio, `${item.label}: placeholder contrast`).toBeGreaterThanOrEqual(4.5)
  for (const item of report.grayscale) {
    expect(item.value, `${item.token} must be defined`).not.toBe('')
    expect(item.spread, `${item.token}: neutral palette`).toBeLessThanOrEqual(6)
  }
}

export async function readableLesson(page: Page) {
  const metrics = await page.locator('.focus-section .math-text, .focus-section .knowledge-block p, .focus-section .lesson-content > .panel > p:not(.help):not(.content-warning):not(.original-label):not(.pending-copy)').evaluateAll(elements => elements.filter(el => el.checkVisibility()).map(el => {
    const style = getComputedStyle(el)
    return { text: el.textContent?.slice(0, 40), size: parseFloat(style.fontSize), weight: parseFloat(style.fontWeight), lineHeight: parseFloat(style.lineHeight) / parseFloat(style.fontSize) }
  }))
  expect(metrics.length).toBeGreaterThan(0)
  for (const metric of metrics) {
    expect(metric.size, metric.text).toBeGreaterThanOrEqual(16)
    expect(metric.lineHeight, metric.text).toBeGreaterThanOrEqual(1.65)
    expect(metric.weight, metric.text).toBeLessThanOrEqual(500)
  }
  const width = await page.locator('.focus-content').evaluate(el => el.getBoundingClientRect().width)
  expect(width).toBeLessThanOrEqual(760)
}

export async function keyboardFocusRing(page: Page, target: Locator) {
  await page.keyboard.press('Tab')
  await target.focus()
  await expect(target).toBeFocused()
  const ring = await target.evaluate(element => {
    const style = getComputedStyle(element)
    const parse = (value: string) => value.match(/[\d.]+/g)!.map(Number)
    const background = (node: Element | null): number[] => {
      if (!node) return [255, 255, 255]
      const parts = parse(getComputedStyle(node).backgroundColor), alpha = parts[3] ?? 1, under = background(node.parentElement)
      return parts.slice(0, 3).map((n, index) => n * alpha + under[index]! * (1 - alpha))
    }
    const lum = (parts: number[]) => parts.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, index) => sum + n * [.2126, .7152, .0722][index]!, 0)
    const front = lum(parse(style.outlineColor)), back = lum(background(parseFloat(style.outlineOffset) < 0 ? element : element.parentElement))
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), ratio: (Math.max(front, back) + .05) / (Math.min(front, back) + .05) }
  })
  expect(ring.style).not.toBe('none')
  expect(ring.width).toBeGreaterThanOrEqual(2)
  expect(ring.ratio).toBeGreaterThanOrEqual(3)
}
