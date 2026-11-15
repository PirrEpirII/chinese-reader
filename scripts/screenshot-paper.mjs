import { chromium } from '@playwright/test'

const base = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
await page.goto(`${base}/`)
await page.evaluate(() => {
  window.localStorage.clear()
  window.localStorage.setItem('chinese-reader-settings-v1', JSON.stringify({ theme: 'paper', fontSize: 1 }))
})
await page.reload()
await page.getByRole('heading', { name: '前三季度经济运行总体平稳 高质量发展取得新成效' }).waitFor()
await page.screenshot({ path: 'test-results/paper-reader.png', fullPage: true })
await page.locator('.word').filter({ hasText: '新质生产力' }).click()
await page.screenshot({ path: 'test-results/paper-word-sheet.png', fullPage: true })
await page.getByRole('button', { name: 'Add to learning' }).click()
await page.keyboard.press('Escape')
await page.locator('.mobile-nav button').filter({ hasText: 'Learning' }).click()
await page.getByRole('button', { name: 'Reading settings' }).click()
await page.screenshot({ path: 'test-results/paper-learning-settings.png', fullPage: true })
await browser.close()
console.log('paper screenshots written')
