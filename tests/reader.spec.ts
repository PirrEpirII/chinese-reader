import { test, expect, type Page } from '@playwright/test'

// The app renders the bundled study packages (public/packages/*.json).
const ARTICLE_TITLE = '前三季度经济运行总体平稳 高质量发展取得新成效'
const SYNTH_TITLE = '公园里的一天（示例）'
const TARGET_WORD = '新质生产力'
const TARGET_PINYIN = 'xīn zhì shēng chǎn lì'
const TARGET_MEANING = '"new quality productive forces": policy term for innovation-driven, high-tech productivity'
const TARGET_CLAUSE = '因地制宜培育壮大新质生产力，'

const GITHUB_TITLE = 'GitHub 示例：月亮'
const GITHUB_PACKAGE = {
  schema_version: 1,
  package_id: 'package-gh-001',
  created_at: '2026-11-16T00:00:00+00:00',
  article: {
    id: 'article-gh-001',
    title: GITHUB_TITLE,
    source_name: 'GitHub 测试',
    source_url: '',
    date: '2026-11-16',
  },
  paragraphs: [
    [
      { t: '月亮', w: 1 },
      { t: '很', w: 1 },
      { t: '圆', w: 1 },
      { t: '。' },
    ],
  ],
  lexicon: {
    月亮: { pinyin: 'yuè liang', origin: 'dictionary', entries: [{ pinyin: 'yuè liang', defs: ['moon'] }] },
    很: { pinyin: 'hěn', origin: 'dictionary', entries: [{ pinyin: 'hěn', defs: ['very'] }] },
    圆: { pinyin: 'yuán', origin: 'dictionary', entries: [{ pinyin: 'yuán', defs: ['round'] }] },
  },
}

const targetWord = (page: Page) => page.locator('.word').filter({ hasText: TARGET_WORD })
const libraryCard = (page: Page, title: string) => page.locator('.library-card').filter({ hasText: title })

async function cleanStart(page: Page) {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
}

async function openPackage(page: Page, title: string = ARTICLE_TITLE) {
  await libraryCard(page, title).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
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
  await openPackage(page)
  await page.screenshot({ path: 'test-results/mobile-reader.png', fullPage: true })

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const smallTargets = await page.locator('button:visible').evaluateAll((buttons) => buttons
    .map((button) => ({ label: button.getAttribute('aria-label') || button.textContent, rect: button.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width < 44 || rect.height < 44)
    .map(({ label }) => label))
  expect(smallTargets).toEqual([])

  await targetWord(page).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('heading', { name: TARGET_WORD, exact: true })).toBeVisible()
  await expect(page.getByRole('dialog').getByText(TARGET_PINYIN, { exact: true }).first()).toBeVisible()
  await expect(page.getByText(TARGET_MEANING, { exact: true })).toBeVisible()
  await expect(page.getByText('From your glossary', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog').getByText(TARGET_CLAUSE, { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/mobile-word-sheet.png', fullPage: true })
  await page.getByRole('button', { name: 'Add to learning' }).click()
  await expect(page.getByRole('button', { name: 'Saved to learning' })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.locator('.mobile-nav button').filter({ hasText: 'Learning' }).click()
  await expect(page.locator('.learning-card h2')).toHaveText(TARGET_WORD)
  await expect(page.locator('.learning-card .card-context p')).toHaveText(TARGET_CLAUSE)
  await page.reload()
  await page.locator('.mobile-nav button').filter({ hasText: 'Learning' }).click()
  await expect(page.locator('.learning-card h2')).toHaveText(TARGET_WORD)
  await page.screenshot({ path: 'test-results/mobile-learning.png', fullPage: true })

  await page.getByRole('button', { name: 'Reset test data' }).click()
  await expect(page.getByText('Clear all 1 saved word?')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('.learning-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Reset test data' }).click()
  await page.getByRole('button', { name: 'Clear words', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your list starts in the text.' })).toBeVisible()
  await page.getByRole('button', { name: 'Start reading' }).click()
  await expect(page.getByRole('heading', { name: ARTICLE_TITLE })).toBeVisible()
  expect(errors).toEqual([])
  expect(missing).toEqual([])
})

test('sheet closes by button, backdrop and Escape', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await cleanStart(page)
  await openPackage(page)
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

test('unsave with undo, copy as Markdown, theme and text size settings', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.setViewportSize({ width: 375, height: 812 })
  await cleanStart(page)
  await openPackage(page)

  // Save a word, then unsave it from the sheet; the Saved button is tappable.
  await targetWord(page).click()
  await page.getByRole('button', { name: 'Add to learning' }).click()
  await page.keyboard.press('Escape')
  await targetWord(page).click()
  await page.getByRole('button', { name: 'Saved to learning' }).click()
  await expect(page.getByRole('button', { name: 'Add to learning' })).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved to learning' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Learning view: one card; copy produces the Markdown table.
  await page.locator('.mobile-nav button').filter({ hasText: 'Learning' }).click()
  await expect(page.locator('.learning-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Copy as Markdown' }).click()
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toContain('| word | pinyin | meaning | clause | source | date |')
  expect(clipboard).toContain(`| ${TARGET_WORD} | ${TARGET_PINYIN} |`)
  expect(clipboard).toContain(TARGET_CLAUSE)

  // Remove from the card, then undo from the toast.
  await page.getByRole('button', { name: `Remove ${TARGET_WORD} from learning` }).click()
  await expect(page.locator('.learning-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.learning-card')).toHaveCount(1)

  // Settings: theme choice applies to the document, text size to the article.
  await page.getByRole('button', { name: 'Reading settings' }).click()
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  await page.screenshot({ path: 'test-results/mobile-dark-theme.png', fullPage: true })
  await page.getByRole('button', { name: 'Paper', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('paper')
  await page.getByRole('button', { name: 'XL', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.locator('.mobile-nav button').filter({ hasText: 'Read' }).click()
  expect(await page.evaluate(() => {
    const article = document.querySelector('.chinese-article')
    return article ? getComputedStyle(article).fontSize : ''
  })).toBe('26px')
})

test('offline reload preserves article, package and saved learning data', async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await cleanStart(page)
  await waitForOfflineCache(page)
  await openPackage(page)
  await targetWord(page).click()
  await page.getByRole('button', { name: 'Add to learning' }).click()
  await page.keyboard.press('Escape')
  const cachedAssetCount = await page.evaluate(async () => {
    const cache = await caches.open('chinese-reader-test-v1')
    return (await cache.keys()).filter((request) => request.url.includes('/assets/')).length
  })
  expect(cachedAssetCount).toBeGreaterThanOrEqual(2)
  const packageCached = await page.evaluate(async () => {
    const cache = await caches.open('chinese-reader-test-v1')
    return (await cache.keys()).some((request) => request.url.includes('/packages/package-000001.json'))
  })
  expect(packageCached).toBe(true)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
  await page.reload()
  await expect(page.getByRole('heading', { name: ARTICLE_TITLE })).toBeVisible()
  await expect(page.getByText('Offline mode', { exact: true })).toBeVisible()
  await page.locator('.mobile-nav button').filter({ hasText: 'Learning' }).click()
  await expect(page.locator('.learning-card h2')).toHaveText(TARGET_WORD)
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
  await openPackage(page)
  await page.screenshot({ path: 'test-results/desktop-reader.png', fullPage: true })
  await targetWord(page).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.screenshot({ path: 'test-results/desktop-word-sheet.png', fullPage: true })
  await page.getByRole('button', { name: 'Add to learning' }).click()
  await page.getByRole('button', { name: 'Close word notes' }).click()
  await page.locator('.sidebar-link').filter({ hasText: 'Learning' }).click()
  await expect(page.locator('.learning-card h2')).toHaveText(TARGET_WORD)
  await page.screenshot({ path: 'test-results/desktop-learning.png', fullPage: true })
  expect(errors).toEqual([])
  expect(missing).toEqual([])
})

test('library shows both packages, records progress and resumes the reading position', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await cleanStart(page)

  // Both bundled packages are listed with a not-started state.
  await expect(libraryCard(page, ARTICLE_TITLE)).toBeVisible()
  await expect(libraryCard(page, SYNTH_TITLE)).toBeVisible()
  await expect(libraryCard(page, ARTICLE_TITLE).getByText('Start reading', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/mobile-library.png', fullPage: true })

  // Read to the end, then leave: the card reports progress.
  await openPackage(page)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(500)
  await page.locator('.mobile-nav button').filter({ hasText: 'Library' }).click()
  const card = libraryCard(page, ARTICLE_TITLE)
  await expect(card.getByText(/% read · Continue/)).toBeVisible()

  // Reopening restores the scrolled position instead of the top.
  await card.click()
  await expect(page.getByRole('heading', { name: ARTICLE_TITLE })).toBeVisible()
  await page.waitForFunction(() => window.scrollY > 100)
})

test('phrase selection extends by word and saves as one entry', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await cleanStart(page)
  await openPackage(page, SYNTH_TITLE)

  // Tap 天气, then extend forward over 很 and 好.
  await page.getByRole('button', { name: '天气, explain this word' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: '天气', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Extend selection forward' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: '天气很', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Extend selection forward' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: '天气很好', exact: true })).toBeVisible()
  await expect(page.getByText('tiān qì hěn hǎo', { exact: true })).toBeVisible()
  await expect(page.getByText('Phrase selected', { exact: true })).toBeVisible()
  await expect(page.getByText('weather', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/mobile-phrase-sheet.png', fullPage: true })

  // Extending backward wraps around the punctuation boundary correctly:
  // back from 天气很好 stays inside the same clause (今天早上 is before the comma).
  await page.getByRole('button', { name: 'Extend selection backward' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: '早上，天气很好', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Extend selection backward' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: '今天早上，天气很好', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Add phrase to learning' }).click()
  await expect(page.getByRole('button', { name: 'Saved to learning' })).toBeEnabled()
  await page.keyboard.press('Escape')

  await page.locator('.mobile-nav button').filter({ hasText: 'Learning' }).click()
  await expect(page.locator('.learning-card h2')).toHaveText('今天早上，天气很好')
  await expect(page.locator('.learning-card .card-pinyin')).toHaveText('jīn tiān zǎo shang tiān qì hěn hǎo')
})

test('GitHub library source syncs packages from a mocked API and caches them', async ({ page }) => {
  const authorizations: string[] = []
  await page.route('https://api.github.com/**', async (route) => {
    authorizations.push(route.request().headers()['authorization'] ?? '')
    const url = route.request().url()
    if (url.endsWith('/contents/packages')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ name: 'package-gh-001.json', type: 'file' }]),
      })
    } else if (url.endsWith('/contents/packages/package-gh-001.json')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(GITHUB_PACKAGE),
      })
    } else {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
    }
  })

  await page.setViewportSize({ width: 375, height: 812 })
  await cleanStart(page)

  // Without a token the sync asks for one instead of calling the API.
  await page.getByRole('button', { name: 'Reading settings' }).click()
  await page.getByRole('button', { name: 'Sync library' }).click()
  await expect(page.getByText('Add a token first, then sync.', { exact: true })).toBeVisible()
  expect(authorizations).toEqual([])

  // With a token, the GitHub package joins the library and survives reload.
  await page.getByLabel('GitHub token').fill('test-token-123')
  await page.getByRole('button', { name: 'Sync library' }).click()
  await expect(page.getByText('Synced 1 package from GitHub', { exact: true })).toBeVisible()
  expect(authorizations.length).toBeGreaterThan(0)
  expect(authorizations.every((header) => header === 'Bearer test-token-123')).toBe(true)
  await page.keyboard.press('Escape')

  await expect(libraryCard(page, GITHUB_TITLE)).toBeVisible()
  await expect(libraryCard(page, GITHUB_TITLE).getByText('GitHub', { exact: true })).toBeVisible()
  await page.reload()
  await expect(libraryCard(page, GITHUB_TITLE)).toBeVisible()

  // The synced package opens like a bundled one.
  await libraryCard(page, GITHUB_TITLE).click()
  await expect(page.getByRole('heading', { name: GITHUB_TITLE })).toBeVisible()
  await page.getByRole('button', { name: '月亮, explain this word' }).click()
  await expect(page.getByText('yuè liang', { exact: true }).first()).toBeVisible()
})

for (const width of [768, 1024]) {
  test(`responsive reading layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await cleanStart(page)
    await openPackage(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await targetWord(page).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

// ---- Added 2026-11-16: phrase shortening and spaced review ----

const REVIEW_KEY = 'chinese-reader-review-v1'

async function pageDate(page: Page, offsetDays: number): Promise<string> {
  return page.evaluate((offset) => {
    const date = new Date()
    date.setDate(date.getDate() + offset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }, offsetDays)
}

async function reviewState(page: Page, id: string) {
  return page.evaluate(([key, wordId]) => JSON.parse(window.localStorage.getItem(key) ?? '{}')[wordId], [REVIEW_KEY, id])
}

async function makeDue(page: Page, id: string, stage: number) {
  const yesterday = await pageDate(page, -1)
  await page.evaluate(([key, wordId, due, step]) => {
    const all = JSON.parse(window.localStorage.getItem(key as string) ?? '{}')
    all[wordId as string] = { ...(all[wordId as string] ?? { right: 0, wrong: 0, last: '' }), stage: step, due }
    window.localStorage.setItem(key as string, JSON.stringify(all))
  }, [REVIEW_KEY, id, yesterday, stage] as const)
  await page.reload()
  await page.locator('.mobile-nav button').filter({ hasText: 'Learning' }).click()
  await expect(page.getByRole('heading', { name: 'Learning' })).toBeVisible()
}

async function saveTargetAndOpenLearning(page: Page) {
  await page.setViewportSize({ width: 375, height: 812 })
  await cleanStart(page)
  await openPackage(page)
  await targetWord(page).click()
  await page.getByRole('button', { name: 'Add to learning' }).click()
  await page.keyboard.press('Escape')
  await page.locator('.mobile-nav button').filter({ hasText: 'Learning' }).click()
  await expect(page.getByRole('heading', { name: 'Learning' })).toBeVisible()
}

test('phrase selection can be shortened from either end', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await cleanStart(page)
  await openPackage(page, SYNTH_TITLE)

  await page.getByRole('button', { name: '天气, explain this word' }).click()
  const heading = (name: string) => page.getByRole('dialog').getByRole('heading', { name, exact: true })
  // A single word has nothing to shorten.
  await expect(page.getByRole('button', { name: 'Remove last word from phrase' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Extend selection forward' }).click()
  await page.getByRole('button', { name: 'Extend selection forward' }).click()
  await expect(heading('天气很好')).toBeVisible()

  // One step too far is undone without closing the sheet.
  await page.getByRole('button', { name: 'Remove last word from phrase' }).click()
  await expect(heading('天气很')).toBeVisible()
  await page.getByRole('button', { name: 'Remove first word from phrase' }).click()
  await expect(heading('很', )).toBeVisible()
  await expect(page.getByText('Select a phrase', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove first word from phrase' })).toHaveCount(0)

  // Shortening works after a backward extend as well, across the comma.
  await page.getByRole('button', { name: 'Extend selection backward' }).click()
  await page.getByRole('button', { name: 'Extend selection backward' }).click()
  await expect(heading('早上，天气很')).toBeVisible()
  await page.getByRole('button', { name: 'Remove first word from phrase' }).click()
  await expect(heading('天气很')).toBeVisible()
  await page.screenshot({ path: 'test-results/mobile-phrase-shorten.png', fullPage: true })
})

test('flashcard review follows the 1, 3, 7, 16 day schedule and repeats wrong cards', async ({ page }) => {
  await saveTargetAndOpenLearning(page)
  const tomorrow = await pageDate(page, 1)
  const today = await pageDate(page, 0)

  // A newly saved word is due at once.
  await expect(page.locator('.review-panel')).toContainText('1')
  await expect(page.locator('.review-panel')).toContainText('word is due for review')
  await expect(page.locator('.card-review')).toHaveText('Review: new, due now')

  await page.getByRole('button', { name: 'Flashcards' }).click()
  await expect(page.locator('.review-bar')).toContainText('Card 1 of 1 · Flashcards')
  await expect(page.locator('.review-card h2')).toHaveText(TARGET_WORD)
  await expect(page.getByText(TARGET_MEANING, { exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/mobile-review-front.png', fullPage: true })
  await page.getByRole('button', { name: 'Show answer' }).click()
  await expect(page.getByText(TARGET_MEANING, { exact: true })).toBeVisible()
  await expect(page.locator('.review-card .card-pinyin')).toHaveText(TARGET_PINYIN)
  await expect(page.locator('.review-clause')).toHaveText(TARGET_CLAUSE)
  await page.screenshot({ path: 'test-results/mobile-review-back.png', fullPage: true })
  await page.getByRole('button', { name: 'Got it' }).click()

  await expect(page.getByRole('heading', { name: 'Review finished.' })).toBeVisible()
  await expect(page.getByText('1 right, 0 to repeat.', { exact: false })).toBeVisible()
  expect(await reviewState(page, TARGET_WORD)).toMatchObject({ stage: 1, due: tomorrow, right: 1, wrong: 0 })

  await page.getByRole('button', { name: 'Back to my words' }).click()
  await expect(page.locator('.card-review')).toHaveText(`Next review ${tomorrow} · step 1 of 4`)
  await expect(page.locator('.review-panel')).toContainText(`Next review ${tomorrow}`)

  // Second correct answer, a day late: three days ahead.
  await makeDue(page, TARGET_WORD, 1)
  await page.getByRole('button', { name: 'Flashcards' }).click()
  await page.getByRole('button', { name: 'Show answer' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()
  expect(await reviewState(page, TARGET_WORD)).toMatchObject({ stage: 2, due: await pageDate(page, 3) })

  // Third and fourth: seven, then sixteen days; the last step stays at sixteen.
  for (const [stage, days] of [[2, 7], [3, 16], [4, 16]] as const) {
    await page.getByRole('button', { name: 'Back to my words' }).click()
    await makeDue(page, TARGET_WORD, stage)
    await page.getByRole('button', { name: 'Flashcards' }).click()
    await page.getByRole('button', { name: 'Show answer' }).click()
    await page.getByRole('button', { name: 'Got it' }).click()
    expect(await reviewState(page, TARGET_WORD)).toMatchObject({ stage: Math.min(stage + 1, 4), due: await pageDate(page, days) })
  }

  // A wrong answer resets the word and brings the card back in the same session.
  await page.getByRole('button', { name: 'Back to my words' }).click()
  await makeDue(page, TARGET_WORD, 3)
  await page.getByRole('button', { name: 'Flashcards' }).click()
  await page.getByRole('button', { name: 'Show answer' }).click()
  await page.getByRole('button', { name: 'Again' }).click()
  await expect(page.locator('.review-bar')).toContainText('Card 2 of 2')
  expect(await reviewState(page, TARGET_WORD)).toMatchObject({ stage: 0, due: today, wrong: 1 })
  await page.getByRole('button', { name: 'Show answer' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByText('1 right, 1 to repeat.', { exact: false })).toBeVisible()
  expect(await reviewState(page, TARGET_WORD)).toMatchObject({ stage: 0, due: tomorrow })

  // Nothing due: a session is practice and leaves the schedule alone.
  await page.getByRole('button', { name: 'Back to my words' }).click()
  const before = await reviewState(page, TARGET_WORD)
  await page.getByRole('button', { name: 'Flashcards' }).click()
  await expect(page.locator('.review-bar')).toContainText('Practice')
  await page.getByRole('button', { name: 'Show answer' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByText('This was practice', { exact: false })).toBeVisible()
  expect(await reviewState(page, TARGET_WORD)).toEqual(before)
})

test('multiple choice takes wrong answers from unsaved words in the loaded texts', async ({ page }) => {
  await saveTargetAndOpenLearning(page)
  const tomorrow = await pageDate(page, 1)

  await page.getByRole('button', { name: 'Multiple choice' }).click()
  await expect(page.locator('.review-bar')).toContainText('Card 1 of 1 · Multiple choice')
  const options = page.locator('.choice-option')
  await expect(options).toHaveCount(4)
  const texts = await options.allTextContents()
  expect(new Set(texts).size).toBe(4)
  expect(texts).toContain(TARGET_MEANING)

  // Every wrong option is the first meaning of a word that is not saved.
  const allowed = await page.evaluate(async (savedId) => {
    const files = await (await fetch('./packages/index.json')).json() as string[]
    const meanings: string[] = []
    for (const file of files) {
      const data = await (await fetch(`./packages/${file}`)).json()
      for (const [key, entry] of Object.entries(data.lexicon as Record<string, { entries: { defs: string[] }[] }>)) {
        if (key !== savedId && entry.entries[0]) meanings.push(entry.entries[0].defs.join('; '))
      }
    }
    return meanings
  }, TARGET_WORD)
  for (const text of texts.filter((value) => value !== TARGET_MEANING)) expect(allowed).toContain(text)
  await page.screenshot({ path: 'test-results/mobile-review-choice.png', fullPage: true })

  // Wrong pick: both answers are marked and the card returns.
  const wrongText = texts.find((value) => value !== TARGET_MEANING) as string
  await options.filter({ hasText: wrongText }).first().click()
  await expect(page.locator('.choice-option.is-wrong')).toHaveText(wrongText)
  await expect(page.locator('.choice-option.is-correct')).toHaveText(TARGET_MEANING)
  await expect(page.locator('.review-verdict')).toContainText('Not this time')
  await page.getByRole('button', { name: 'Next card' }).click()
  await expect(page.locator('.review-bar')).toContainText('Card 2 of 2')

  await page.locator('.choice-option').filter({ hasText: TARGET_MEANING }).click()
  await expect(page.locator('.review-verdict')).toHaveText('Correct')
  await page.getByRole('button', { name: 'Next card' }).click()
  await expect(page.getByText('1 right, 1 to repeat.', { exact: false })).toBeVisible()
  expect(await reviewState(page, TARGET_WORD)).toMatchObject({ stage: 0, due: tomorrow, right: 1, wrong: 1 })
})

test('a saved phrase is reviewed as a flashcard even in multiple choice', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await cleanStart(page)
  await openPackage(page, SYNTH_TITLE)
  await page.getByRole('button', { name: '天气, explain this word' }).click()
  await page.getByRole('button', { name: 'Extend selection forward' }).click()
  await page.getByRole('button', { name: 'Add phrase to learning' }).click()
  await page.keyboard.press('Escape')
  await page.locator('.mobile-nav button').filter({ hasText: 'Learning' }).click()

  await page.getByRole('button', { name: 'Multiple choice' }).click()
  await expect(page.locator('.review-card h2')).toHaveText('天气很')
  await expect(page.locator('.choice-option')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible()
})
