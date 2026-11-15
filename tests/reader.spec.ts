import { test, expect, type Page } from '@playwright/test'

const targetWord = (page: Page) => page.locator('.word').filter({ hasText: '可持续发展' })

async function cleanStart(page: Page) {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await expect(page.getByRole('heading', { name: '一座面向未来的城市' })).toBeVisible()
}

async function waitForOfflineCache(page: Page) {
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.ready
  })
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible()
}

test('mobile reading, saving, persistence, learning list and reset', async ({ page }) => {
  const errors: string[] = []
  const missing: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => { if (response.status() === 404) missing.push(response.url()) })
  await page.setViewportSize({ width: 375, height: 812 })
  await cleanStart(page)
  await waitForOfflineCache(page)
  await page.screenshot({ path: 'test-results/mobile-reader.png', fullPage: true })

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const smallTargets = await page.locator('button:visible').evaluateAll((buttons) => buttons
    .map((button) => ({ label: button.getAttribute('aria-label') || button.textContent, rect: button.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width < 44 || rect.height < 44)
    .map(({ label }) => label))
  expect(smallTargets).toEqual([])

  await targetWord(page).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('heading', { name: '可持续发展', exact: true })).toBeVisible()
  await expect(page.getByText('kě chí xù fā zhǎn', { exact: true })).toBeVisible()
  await expect(page.getByText('sustainable development', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/mobile-word-sheet.png', fullPage: true })
  await page.getByRole('button', { name: 'Add to learning' }).click()
  await expect(page.getByRole('button', { name: 'Saved to learning' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.locator('.mobile-nav button').filter({ hasText: 'Learning' }).click()
  await expect(page.locator('.learning-card h2')).toHaveText('可持续发展')
  await page.reload()
  await page.locator('.mobile-nav button').filter({ hasText: 'Learning' }).click()
  await expect(page.locator('.learning-card h2')).toHaveText('可持续发展')
  await page.screenshot({ path: 'test-results/mobile-learning.png', fullPage: true })

  await page.getByRole('button', { name: 'Reset test data' }).click()
  await expect(page.getByText('Clear all 1 saved word?')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('.learning-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Reset test data' }).click()
  await page.getByRole('button', { name: 'Clear words', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your list starts in the text.' })).toBeVisible()
  await page.getByRole('button', { name: 'Explore sample text' }).click()
  await expect(page.getByRole('heading', { name: '一座面向未来的城市' })).toBeVisible()
  expect(errors).toEqual([])
  expect(missing).toEqual([])
})

test('sheet closes by button, backdrop and Escape', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await cleanStart(page)
  await targetWord(page).click()
  await page.getByRole('button', { name: 'Close word notes' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await targetWord(page).click()
  await page.mouse.click(12, 12)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await targetWord(page).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Close word notes' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(targetWord(page)).toBeFocused()
})

test('offline reload preserves article and saved learning data', async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await cleanStart(page)
  await waitForOfflineCache(page)
  await targetWord(page).click()
  await page.getByRole('button', { name: 'Add to learning' }).click()
  await page.keyboard.press('Escape')
  const cachedAssetCount = await page.evaluate(async () => {
    const cache = await caches.open('chinese-reader-test-v1')
    return (await cache.keys()).filter((request) => request.url.includes('/assets/')).length
  })
  expect(cachedAssetCount).toBeGreaterThanOrEqual(2)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
  await page.reload()
  await expect(page.getByRole('heading', { name: '一座面向未来的城市' })).toBeVisible()
  await expect(page.getByText('Offline mode', { exact: true })).toBeVisible()
  await page.locator('.mobile-nav button').filter({ hasText: 'Learning' }).click()
  await expect(page.locator('.learning-card h2')).toHaveText('可持续发展')
  await page.screenshot({ path: 'test-results/mobile-offline-learning.png', fullPage: true })
  await context.setOffline(false)
})

test('desktop layout and primary flow have no browser errors or missing assets', async ({ page }) => {
  const errors: string[] = []
  const missing: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => { if (response.status() === 404) missing.push(response.url()) })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await cleanStart(page)
  await waitForOfflineCache(page)
  await expect(page.locator('.desktop-sidebar')).toBeVisible()
  await expect(page.locator('.mobile-nav')).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/desktop-reader.png', fullPage: true })
  await targetWord(page).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.screenshot({ path: 'test-results/desktop-word-sheet.png', fullPage: true })
  await page.getByRole('button', { name: 'Add to learning' }).click()
  await page.getByRole('button', { name: 'Close word notes' }).click()
  await page.locator('.sidebar-link').filter({ hasText: 'Learning' }).click()
  await expect(page.locator('.learning-card h2')).toHaveText('可持续发展')
  await page.screenshot({ path: 'test-results/desktop-learning.png', fullPage: true })
  expect(errors).toEqual([])
  expect(missing).toEqual([])
})

for (const width of [768, 1024]) {
  test(`responsive reading layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await cleanStart(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await targetWord(page).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
