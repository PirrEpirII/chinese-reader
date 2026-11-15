import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const distRoot = path.join(projectRoot, 'dist')

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name)
    return entry.isDirectory() ? listFiles(absolute) : [absolute]
  }))
  return files.flat()
}

const files = (await listFiles(distRoot))
  .map((file) => path.relative(distRoot, file).replaceAll(path.sep, '/'))
  .filter((file) => file !== 'sw.js')
  .sort()
  .map((file) => `./${file}`)

const template = await readFile(path.join(projectRoot, 'public', 'sw.js'), 'utf8')
const marker = 'const APP_SHELL = []'
if (!template.includes(marker)) throw new Error('Service-worker precache marker is missing.')
const output = template.replace(marker, `const APP_SHELL = ${JSON.stringify(files, null, 2)}`)
await writeFile(path.join(distRoot, 'sw.js'), output)
console.log(`Service worker will precache ${files.length} build files.`)
