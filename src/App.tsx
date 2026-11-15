import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Copy,
  Layers3,
  Library,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Wifi,
  X,
} from 'lucide-react'
import './App.css'

type PackageToken = {
  t: string
  w?: 1
  k?: string
}

type LexiconSense = {
  pinyin: string
  defs: string[]
}

type LexiconEntry = {
  pinyin: string
  origin: 'dictionary' | 'glossary'
  note?: string
  entries: LexiconSense[]
}

type StudyPackage = {
  schema_version: number
  package_id: string
  created_at: string
  article: {
    id: string
    title: string
    source_name: string
    source_url: string
    date: string
  }
  paragraphs: PackageToken[][]
  lexicon: Record<string, LexiconEntry>
}

// A selection is a range of token indices inside one paragraph. A single
// word is start === end; the ◀ ▶ controls extend the range to a phrase.
type Selection = {
  paragraphIndex: number
  start: number
  end: number
}

// Self-contained learning record: survives a change of article and can be
// exported without access to the package lexicon.
type Occurrence = {
  clause: string
  source: string
  savedAt: string
}

type PoolEntry = {
  id: string
  word: string
  pinyin: string
  meaning: string
  occurrences: Occurrence[]
}

type ThemeChoice = 'auto' | 'paper' | 'light' | 'dark'

type Settings = {
  theme: ThemeChoice
  fontSize: number
}

type Progress = {
  paragraphIndex: number
  openedAt: string
}

type ProgressMap = Record<string, Progress>

type Toast = {
  text: string
  action?: {
    label: string
    run: () => void
  }
}

type View = 'library' | 'read' | 'learn'

type GithubFile = {
  name: string
  type: string
}

const POOL_KEY = 'chinese-reader-vocab-v1'
const SETTINGS_KEY = 'chinese-reader-settings-v1'
const PROGRESS_KEY = 'chinese-reader-progress-v1'
const CURRENT_PACKAGE_KEY = 'chinese-reader-current-v1'
const GITHUB_TOKEN_KEY = 'chinese-reader-github-token-v1'
const GITHUB_CACHE_KEY = 'chinese-reader-packages-v1'
const MANIFEST_URL = './packages/index.json'
const GITHUB_REPO = 'PirrEpirII/chinese-reader-data'

const FONT_SIZES = [19, 21, 23, 26]
const FONT_SIZE_LABELS = ['S', 'M', 'L', 'XL']
const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'paper', label: 'Paper' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

// Clause boundaries per tools/README.md: official sentences run to ~180
// characters, so saved context is the clause around the word.
const CLAUSE_BOUNDARIES = new Set([
  '，', '、', '；', '。', '：', '！', '？',
  '（', '）', '(', ')', '【', '】', '「', '」', '“', '”',
])

function clauseAroundRange(paragraph: PackageToken[], start: number, end: number): string {
  let clauseStart = 0
  let clauseEnd = paragraph.length
  for (let index = start - 1; index >= 0; index -= 1) {
    if (CLAUSE_BOUNDARIES.has(paragraph[index].t)) {
      clauseStart = index + 1
      break
    }
  }
  for (let index = end + 1; index < paragraph.length; index += 1) {
    if (CLAUSE_BOUNDARIES.has(paragraph[index].t)) {
      clauseEnd = index + 1
      break
    }
  }
  return paragraph.slice(clauseStart, clauseEnd).map((token) => token.t).join('')
}

function firstMeaning(entry: LexiconEntry): string {
  return entry.entries[0]?.defs.join('; ') ?? ''
}

function resolveTheme(choice: ThemeChoice): 'paper' | 'light' | 'dark' {
  if (choice !== 'auto') return choice
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function tokenKey(token: PackageToken): string | null {
  return token.w === 1 ? token.k ?? token.t : null
}

function isWordToken(pkg: StudyPackage, paragraphIndex: number, tokenIndex: number): boolean {
  const token = pkg.paragraphs[paragraphIndex]?.[tokenIndex]
  if (!token) return false
  const key = tokenKey(token)
  return key !== null && Boolean(pkg.lexicon[key])
}

function nextWordIndex(pkg: StudyPackage, paragraphIndex: number, from: number, direction: 1 | -1): number | null {
  const paragraph = pkg.paragraphs[paragraphIndex]
  for (let index = from + direction; index >= 0 && index < paragraph.length; index += direction) {
    if (isWordToken(pkg, paragraphIndex, index)) return index
  }
  return null
}

function readPool(): PoolEntry[] {
  try {
    const raw = window.localStorage.getItem(POOL_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is PoolEntry => (
      typeof item === 'object' && item !== null &&
      typeof (item as PoolEntry).id === 'string' &&
      typeof (item as PoolEntry).word === 'string' &&
      typeof (item as PoolEntry).pinyin === 'string' &&
      typeof (item as PoolEntry).meaning === 'string' &&
      Array.isArray((item as PoolEntry).occurrences)
    ))
  } catch {
    return []
  }
}

function readSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { theme: 'auto', fontSize: 1 }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { theme: 'auto', fontSize: 1 }
    const candidate = parsed as Partial<Settings>
    const theme: ThemeChoice = THEME_CHOICES.some((choice) => choice.value === candidate.theme)
      ? candidate.theme as ThemeChoice
      : 'auto'
    const fontSize = typeof candidate.fontSize === 'number' && candidate.fontSize >= 0 && candidate.fontSize < FONT_SIZES.length
      ? Math.floor(candidate.fontSize)
      : 1
    return { theme, fontSize }
  } catch {
    return { theme: 'auto', fontSize: 1 }
  }
}

function readProgress(): ProgressMap {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const result: ProgressMap = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const candidate = value as Partial<Progress>
      if (typeof candidate.paragraphIndex === 'number' && candidate.paragraphIndex >= 0) {
        result[id] = {
          paragraphIndex: Math.floor(candidate.paragraphIndex),
          openedAt: typeof candidate.openedAt === 'string' ? candidate.openedAt : '',
        }
      }
    }
    return result
  } catch {
    return {}
  }
}

function isStudyPackage(data: unknown): data is StudyPackage {
  if (typeof data !== 'object' || data === null) return false
  const candidate = data as Partial<StudyPackage>
  return typeof candidate.package_id === 'string'
    && typeof candidate.article?.title === 'string'
    && Array.isArray(candidate.paragraphs)
    && typeof candidate.lexicon === 'object' && candidate.lexicon !== null
}

function readGithubCache(): StudyPackage[] {
  try {
    const raw = window.localStorage.getItem(GITHUB_CACHE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isStudyPackage)
  } catch {
    return []
  }
}

function readToken(): string {
  try {
    return window.localStorage.getItem(GITHUB_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

function readCurrentId(): string {
  try {
    return window.localStorage.getItem(CURRENT_PACKAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

async function githubRequest(url: string, token: string, accept: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
  return response.json()
}

function App() {
  const [bundled, setBundled] = useState<StudyPackage[] | null>(null)
  const [githubPackages, setGithubPackages] = useState<StudyPackage[]>(readGithubCache)
  const [loadFailed, setLoadFailed] = useState(false)
  const [view, setView] = useState<View>('library')
  const [currentId, setCurrentId] = useState(readCurrentId)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [pool, setPool] = useState<PoolEntry[]>(readPool)
  const [progressMap, setProgressMap] = useState<ProgressMap>(readProgress)
  const [settings, setSettings] = useState<Settings>(readSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [githubToken, setGithubToken] = useState(readToken)
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const [resetArmed, setResetArmed] = useState(false)
  const [online, setOnline] = useState(() => window.navigator.onLine)
  const [cacheReady, setCacheReady] = useState(false)
  const articleRef = useRef<HTMLElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const restoredRef = useRef(false)

  // Bundled packages come from the manifest; GitHub packages are cached in
  // this browser. GitHub wins on a package_id collision (it is newer data).
  const allPackages = useMemo(() => {
    const merged = new Map<string, StudyPackage>()
    for (const pkg of bundled ?? []) merged.set(pkg.package_id, pkg)
    for (const pkg of githubPackages) merged.set(pkg.package_id, pkg)
    return [...merged.values()]
  }, [bundled, githubPackages])

  const githubIds = useMemo(() => new Set(githubPackages.map((pkg) => pkg.package_id)), [githubPackages])
  const pkg = allPackages.find((candidate) => candidate.package_id === currentId) ?? null

  useEffect(() => {
    let cancelled = false
    fetch(MANIFEST_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Manifest request failed with status ${response.status}`)
        return response.json() as Promise<string[]>
      })
      .then((files) => Promise.all(files.map((file) => (
        fetch(`./packages/${file}`).then((response) => {
          if (!response.ok) throw new Error(`Package ${file} failed with status ${response.status}`)
          return response.json() as Promise<unknown>
        })
      ))))
      .then((data) => {
        if (cancelled) return
        const valid = data.filter(isStudyPackage)
        if (valid.length === 0) throw new Error('No valid packages in manifest')
        setBundled(valid)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => { cancelled = true }
  }, [])

  // Returning reader: jump straight back into the last open package.
  useEffect(() => {
    if (restoredRef.current || !bundled) return
    restoredRef.current = true
    if (currentId && allPackages.some((candidate) => candidate.package_id === currentId)) {
      setView('read')
    }
  }, [bundled, allPackages, currentId])

  useEffect(() => {
    try {
      window.localStorage.setItem(POOL_KEY, JSON.stringify(pool))
    } catch {
      window.setTimeout(() => setToast({ text: 'This browser could not save your learning list.' }), 0)
    }
  }, [pool])

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // Settings are a convenience; a failed write is not worth a toast.
    }
  }, [settings])

  useEffect(() => {
    try {
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressMap))
    } catch {
      // Progress is a convenience; a failed write is not worth a toast.
    }
  }, [progressMap])

  useEffect(() => {
    try {
      window.localStorage.setItem(GITHUB_CACHE_KEY, JSON.stringify(githubPackages))
    } catch {
      // Cache is a convenience; a failed write is not worth a toast.
    }
  }, [githubPackages])

  useEffect(() => {
    try {
      if (githubToken) window.localStorage.setItem(GITHUB_TOKEN_KEY, githubToken)
      else window.localStorage.removeItem(GITHUB_TOKEN_KEY)
    } catch {
      // The token only lives in this browser; a failed write just means no persistence.
    }
  }, [githubToken])

  useEffect(() => {
    try {
      if (currentId) window.localStorage.setItem(CURRENT_PACKAGE_KEY, currentId)
      else window.localStorage.removeItem(CURRENT_PACKAGE_KEY)
    } catch {
      // Convenience only.
    }
  }, [currentId])

  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(settings.theme)
    }
    apply()
    if (settings.theme !== 'auto') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings.theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--reading-size', `${FONT_SIZES[settings.fontSize]}px`)
  }, [settings.fontSize])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const updateConnection = () => setOnline(window.navigator.onLine)
    window.addEventListener('online', updateConnection)
    window.addEventListener('offline', updateConnection)
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.ready.then(() => setCacheReady(true)).catch(() => setCacheReady(false))
    }
    return () => {
      window.removeEventListener('online', updateConnection)
      window.removeEventListener('offline', updateConnection)
    }
  }, [])

  // Auto-resume: scroll back to the last read paragraph when a package opens.
  useEffect(() => {
    if (view !== 'read' || !pkg) return
    const target = Math.min(progressMap[pkg.package_id]?.paragraphIndex ?? 0, pkg.paragraphs.length - 1)
    if (target <= 0) return
    const frame = requestAnimationFrame(() => {
      const node = articleRef.current?.querySelectorAll('p')[target]
      if (node) window.scrollTo({ top: node.getBoundingClientRect().top + window.scrollY - 96 })
    })
    return () => cancelAnimationFrame(frame)
    // progressMap is read once per package open; re-running on every scroll
    // record would fight the reader. eslint-disable-next-line covers this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, pkg?.package_id])

  // Record the paragraph at the top of the reading column while scrolling.
  useEffect(() => {
    if (view !== 'read' || !pkg) return
    const packageId = pkg.package_id
    const record = () => {
      const nodes = articleRef.current?.querySelectorAll('p')
      if (!nodes || nodes.length === 0) return
      let index = nodes.length - 1
      for (let cursor = 0; cursor < nodes.length; cursor += 1) {
        if (nodes[cursor].getBoundingClientRect().bottom > 96) {
          index = cursor
          break
        }
      }
      setProgressMap((current) => {
        if (current[packageId]?.paragraphIndex === index) return current
        return { ...current, [packageId]: { paragraphIndex: index, openedAt: new Date().toISOString() } }
      })
    }
    window.addEventListener('scroll', record, { passive: true })
    return () => window.removeEventListener('scroll', record)
  }, [view, pkg])

  useEffect(() => {
    if (!selection) return
    previousFocusRef.current = document.activeElement as HTMLElement
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelection(null)
      if (event.key !== 'Tab' || !sheetRef.current) return
      const controls = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'))
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKey)
      previousFocusRef.current?.focus()
    }
  }, [selection])

  useEffect(() => {
    if (!settingsOpen) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [settingsOpen])

  // Everything the sheet needs to show for the current selection range.
  const selectionInfo = useMemo(() => {
    if (!selection || !pkg) return null
    const paragraph = pkg.paragraphs[selection.paragraphIndex]
    if (!paragraph) return null
    const tokens = paragraph.slice(selection.start, selection.end + 1)
    const components = tokens
      .map((token) => {
        const key = tokenKey(token)
        return key && pkg.lexicon[key] ? { key, text: token.t, entry: pkg.lexicon[key] } : null
      })
      .filter((component): component is { key: string; text: string; entry: LexiconEntry } => component !== null)
    if (components.length === 0) return null
    const isPhrase = selection.start !== selection.end
    const text = tokens.map((token) => token.t).join('')
    return {
      isPhrase,
      text,
      id: isPhrase ? `phrase:${text}` : components[0].key,
      pinyin: components.map((component) => component.entry.pinyin).filter(Boolean).join(' '),
      meaning: isPhrase
        ? components.map((component) => `${component.text} — ${firstMeaning(component.entry)}`).join('; ')
        : firstMeaning(components[0].entry),
      clause: clauseAroundRange(paragraph, selection.start, selection.end),
      single: isPhrase ? null : components[0],
      components,
      canExtendBack: nextWordIndex(pkg, selection.paragraphIndex, selection.start, -1) !== null,
      canExtendForward: nextWordIndex(pkg, selection.paragraphIndex, selection.end, 1) !== null,
    }
  }, [selection, pkg])

  const selectedIsSaved = selectionInfo ? pool.some((entry) => entry.id === selectionInfo.id) : false

  const switchView = (nextView: View) => {
    setView(nextView)
    setSelection(null)
    setResetArmed(false)
    if (nextView !== 'read') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openPackage = (packageId: string) => {
    setCurrentId(packageId)
    setSelection(null)
    setView('read')
  }

  const extendSelection = (direction: 1 | -1) => {
    setSelection((current) => {
      if (!current || !pkg) return current
      const next = direction === -1
        ? nextWordIndex(pkg, current.paragraphIndex, current.start, -1)
        : nextWordIndex(pkg, current.paragraphIndex, current.end, 1)
      if (next === null) return current
      return direction === -1 ? { ...current, start: next } : { ...current, end: next }
    })
  }

  const addToLearning = () => {
    if (!selectionInfo || !pkg) return
    const existing = pool.find((entry) => entry.id === selectionInfo.id)
    if (existing?.occurrences.some((occurrence) => occurrence.clause === selectionInfo.clause && occurrence.source === pkg.article.title)) {
      setToast({ text: 'Already in your learning list with this clause.' })
      return
    }
    const occurrence: Occurrence = { clause: selectionInfo.clause, source: pkg.article.title, savedAt: new Date().toISOString() }
    setPool((current) => {
      const match = current.find((entry) => entry.id === selectionInfo.id)
      if (match) {
        return current.map((entry) => entry.id === selectionInfo.id
          ? { ...entry, occurrences: [occurrence, ...entry.occurrences] }
          : entry)
      }
      return [{
        id: selectionInfo.id,
        word: selectionInfo.text,
        pinyin: selectionInfo.pinyin,
        meaning: selectionInfo.meaning,
        occurrences: [occurrence],
      }, ...current]
    })
    setToast({ text: `${selectionInfo.text} added to learning` })
  }

  const unsaveWord = (id: string) => {
    const removed = pool.find((entry) => entry.id === id)
    if (!removed) return
    setPool((current) => current.filter((entry) => entry.id !== id))
    setToast({
      text: `${removed.word} removed`,
      action: {
        label: 'Undo',
        run: () => setPool((current) => current.some((entry) => entry.id === id) ? current : [removed, ...current]),
      },
    })
  }

  const copyMarkdown = async () => {
    const rows = pool.flatMap((entry) => entry.occurrences.map((occurrence) => (
      `| ${entry.word} | ${entry.pinyin} | ${entry.meaning} | ${occurrence.clause} | ${occurrence.source} | ${occurrence.savedAt.slice(0, 10)} |`
    )))
    if (rows.length === 0) {
      setToast({ text: 'Nothing to copy yet — save a word first.' })
      return
    }
    const table = [
      '| word | pinyin | meaning | clause | source | date |',
      '|---|---|---|---|---|---|',
      ...rows,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(table)
      setToast({ text: `Copied ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} as Markdown` })
    } catch {
      const helper = document.createElement('textarea')
      helper.value = table
      document.body.appendChild(helper)
      helper.select()
      try {
        document.execCommand('copy')
        setToast({ text: `Copied ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} as Markdown` })
      } catch {
        setToast({ text: 'Copy failed in this browser.' })
      }
      helper.remove()
    }
  }

  const resetTest = () => {
    setPool([])
    setSelection(null)
    setResetArmed(false)
    setToast({ text: 'Saved words cleared. The articles are still here.' })
  }

  const syncGithub = async () => {
    const token = githubToken.trim()
    if (!token) {
      setSyncNote('Add a token first, then sync.')
      return
    }
    setSyncing(true)
    setSyncNote('')
    try {
      const listing = await githubRequest(
        `https://api.github.com/repos/${GITHUB_REPO}/contents/packages`,
        token,
        'application/vnd.github+json',
      ) as GithubFile[]
      const files = Array.isArray(listing) ? listing.filter((file) => file.type === 'file' && file.name.endsWith('.json')) : []
      const fetched: StudyPackage[] = []
      for (const file of files) {
        const data = await githubRequest(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/packages/${encodeURIComponent(file.name)}`,
          token,
          'application/vnd.github.raw',
        )
        if (isStudyPackage(data)) fetched.push(data)
      }
      setGithubPackages(fetched)
      setSyncNote(`Last sync: ${new Date().toISOString().slice(0, 10)} · ${fetched.length} ${fetched.length === 1 ? 'package' : 'packages'}`)
      setToast({ text: `Synced ${fetched.length} ${fetched.length === 1 ? 'package' : 'packages'} from GitHub` })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error'
      setSyncNote(`Sync failed: ${detail}`)
      setToast({ text: `GitHub sync failed — ${detail}` })
    } finally {
      setSyncing(false)
    }
  }

  const connectionLabel = !online ? 'Offline mode' : cacheReady ? 'Offline ready' : 'Local test'

  if (loadFailed) {
    return (
      <div className="app-shell">
        <main className="main-content package-status">
          <h1>Reading library failed to load</h1>
          <p>The package list could not be fetched. Connect once and reload; after the first visit the packages are cached for offline reading.</p>
        </main>
      </div>
    )
  }

  if (!bundled) {
    return (
      <div className="app-shell">
        <main className="main-content package-status">
          <p>Loading reading library…</p>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => switchView('library')} aria-label="Chinese Reader home">
          <span className="brand-mark" aria-hidden="true">阅</span>
          <span>Chinese Reader</span>
        </button>
        <div className="topbar-actions">
          <button className="icon-button settings-button" onClick={() => setSettingsOpen(true)} aria-label="Reading settings">
            <Settings2 size={19} />
          </button>
          <div className={`connection-pill ${online ? '' : 'is-offline'}`} title="Connection and offline-cache status">
            {online ? <Wifi size={14} aria-hidden="true" /> : <CloudOff size={14} aria-hidden="true" />}
            <span>{connectionLabel}</span>
          </div>
        </div>
      </header>

      <div className="workspace">
        <aside className="desktop-sidebar" aria-label="Main navigation">
          <div className="sidebar-label">STUDY SPACE</div>
          <button className={`sidebar-link ${view === 'library' ? 'active' : ''}`} onClick={() => switchView('library')} aria-current={view === 'library' ? 'page' : undefined}>
            <Library size={19} aria-hidden="true" /> Library
          </button>
          <button className={`sidebar-link ${view === 'read' ? 'active' : ''}`} onClick={() => switchView('read')} aria-current={view === 'read' ? 'page' : undefined}>
            <BookOpen size={19} aria-hidden="true" /> Read
          </button>
          <button className={`sidebar-link ${view === 'learn' ? 'active' : ''}`} onClick={() => switchView('learn')} aria-current={view === 'learn' ? 'page' : undefined}>
            <Layers3 size={19} aria-hidden="true" /> Learning
            <span className="nav-count">{pool.length}</span>
          </button>
          <div className="sidebar-note">
            <Sparkles size={17} aria-hidden="true" />
            <p>Read first.<br />Save what matters.</p>
            <span>A small test of the Chinese learning loop.</span>
          </div>
          <div className="privacy-note">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>No account. No cloud sync.<br />Stored in this browser only.</span>
          </div>
        </aside>

        <main className="main-content">
          {view === 'library' && (
            <section className="library-view" aria-labelledby="library-title">
              <div className="content-heading learning-heading">
                <div className="eyebrow">READING LIBRARY <span>/</span> {allPackages.length} {allPackages.length === 1 ? 'TEXT' : 'TEXTS'}</div>
                <h1 id="library-title">Library</h1>
                <p className="english-title">Pick up where you stopped, or start something new.</p>
              </div>

              <div className="library-list">
                {allPackages.map((item) => {
                  const saved = progressMap[item.package_id]
                  const percent = saved && saved.paragraphIndex > 0
                    ? Math.min(99, Math.round((saved.paragraphIndex / Math.max(1, item.paragraphs.length)) * 100))
                    : 0
                  const started = percent > 0
                  return (
                    <button className="library-card" key={item.package_id} onClick={() => openPackage(item.package_id)}>
                      <div className="library-card-main">
                        <span className="library-origin">{githubIds.has(item.package_id) ? 'GitHub' : 'Built-in'}</span>
                        <h2 lang="zh-CN">{item.article.title}</h2>
                        <p className="library-meta"><span>{item.article.source_name}</span><span className="meta-dot" /><span>{item.article.date}</span></p>
                      </div>
                      <div className="library-card-foot">
                        <div className="card-progress" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
                        <span className="library-status">{started ? `${percent}% read · Continue` : 'Start reading'}</span>
                        <ArrowRight size={16} aria-hidden="true" />
                      </div>
                    </button>
                  )
                })}
              </div>
              <p className="dict-credit">Your reading position and words stay in this browser. Add your own texts through the GitHub source in settings.</p>
            </section>
          )}

          {view === 'read' && !pkg && (
            <section className="package-status" aria-label="Nothing selected">
              <h1>Nothing open yet.</h1>
              <p>Choose a text from your library to start reading.</p>
              <button className="primary-button empty-action" onClick={() => switchView('library')}>
                <Library size={17} aria-hidden="true" /> Open library
              </button>
            </section>
          )}

          {view === 'read' && pkg && (
            <section className="reader-view" aria-labelledby="article-title">
              <div className="content-heading">
                <div className="eyebrow">READING PACKAGE <span>/</span> {pkg.package_id}</div>
                <h1 id="article-title">{pkg.article.title}</h1>
                <div className="article-meta"><span>{pkg.article.source_name}</span><span className="meta-dot" /><span>{pkg.article.date}</span></div>
              </div>

              <div className="reading-tip">
                <Bookmark size={17} aria-hidden="true" />
                <span>Tap a word for pinyin, meaning and usage. Extend the selection to save a phrase.</span>
              </div>

              <article className="chinese-article" lang="zh-CN" ref={articleRef}>
                {pkg.paragraphs.map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex}>
                    {paragraph.map((token, tokenIndex) => {
                      const key = tokenKey(token)
                      const entry = key ? pkg.lexicon[key] : undefined
                      if (!key || !entry) {
                        return <span className="punctuation" key={`${paragraphIndex}-${tokenIndex}`}>{token.t}</span>
                      }
                      const isSaved = pool.some((saved) => saved.id === key)
                      const isSelected = selection?.paragraphIndex === paragraphIndex
                        && tokenIndex >= selection.start && tokenIndex <= selection.end
                      return (
                        <button
                          className={`word ${isSaved ? 'is-saved' : ''} ${isSelected ? 'is-selected' : ''}`}
                          key={`${paragraphIndex}-${tokenIndex}`}
                          onClick={() => setSelection({ paragraphIndex, start: tokenIndex, end: tokenIndex })}
                          aria-label={`${token.t}, explain this word${isSaved ? ', saved in learning' : ''}`}
                          aria-pressed={isSelected}
                        >
                          {token.t}
                        </button>
                      )
                    })}
                  </p>
                ))}
              </article>

              <div className="reader-footnote">
                <span className="tiny-check"><Check size={12} aria-hidden="true" /></span>
                Pinyin appears only when you ask for it. Your place is kept automatically.
              </div>
              <p className="dict-credit">Dictionary: CC-CEDICT (CC BY-SA 4.0). Entries marked “From your glossary” are your own corrections.</p>
            </section>
          )}

          {view === 'learn' && (
            <section className="learning-view" aria-labelledby="learning-title">
              <div className="content-heading learning-heading">
                <div className="eyebrow">YOUR WORDS <span>/</span> THIS BROWSER</div>
                <h1 id="learning-title">Learning</h1>
                <p className="english-title">A quiet place for words worth remembering.</p>
              </div>

              <div className="learning-summary">
                <div><strong>{pool.length}</strong><span>{pool.length === 1 ? 'expression' : 'expressions'} saved</span></div>
                <button className="copy-button" onClick={copyMarkdown}>
                  <Copy size={14} aria-hidden="true" /> Copy as Markdown
                </button>
              </div>

              {pool.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon"><Layers3 size={26} strokeWidth={1.5} aria-hidden="true" /></div>
                  <h2>Your list starts in the text.</h2>
                  <p>Tap any unfamiliar word while reading, then save it with its clause.</p>
                  <button className="primary-button empty-action" onClick={() => switchView('read')}>
                    <ArrowLeft size={17} aria-hidden="true" /> Start reading
                  </button>
                </div>
              ) : (
                <div className="learning-list">
                  {pool.map((saved) => (
                    <article className="learning-card" key={saved.id}>
                      <div className="learning-card-top">
                        <div><h2 lang="zh-CN">{saved.word}</h2><p className="card-pinyin">{saved.pinyin}</p></div>
                        <button className="icon-button card-unsave" onClick={() => unsaveWord(saved.id)} aria-label={`Remove ${saved.word} from learning`}>
                          <X size={17} />
                        </button>
                      </div>
                      <p className="card-meaning">{saved.meaning}</p>
                      {saved.occurrences.map((occurrence, occurrenceIndex) => (
                        <div className="card-context" key={occurrenceIndex}>
                          <span>{occurrence.source} · {occurrence.savedAt.slice(0, 10)}</span>
                          <p lang="zh-CN">{occurrence.clause}</p>
                        </div>
                      ))}
                    </article>
                  ))}
                </div>
              )}

              <div className="test-controls">
                {!resetArmed ? (
                  <button className="text-button" onClick={() => setResetArmed(true)} disabled={pool.length === 0}>
                    <RotateCcw size={15} aria-hidden="true" /> Reset test data
                  </button>
                ) : (
                  <div className="reset-confirm" role="group" aria-label="Confirm reset">
                    <p>Clear all {pool.length} saved {pool.length === 1 ? 'word' : 'words'}?</p>
                    <div><button className="danger-button" onClick={resetTest}>Clear words</button><button className="text-button" onClick={() => setResetArmed(false)}>Cancel</button></div>
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Main navigation">
        <button className={view === 'library' ? 'active' : ''} onClick={() => switchView('library')} aria-current={view === 'library' ? 'page' : undefined}>
          <Library size={21} aria-hidden="true" /><span>Library</span>
        </button>
        <button className={view === 'read' ? 'active' : ''} onClick={() => switchView('read')} aria-current={view === 'read' ? 'page' : undefined}>
          <BookOpen size={21} aria-hidden="true" /><span>Read</span>
        </button>
        <button className={view === 'learn' ? 'active' : ''} onClick={() => switchView('learn')} aria-current={view === 'learn' ? 'page' : undefined}>
          <span className="mobile-learning-icon"><Layers3 size={21} aria-hidden="true" />{pool.length > 0 && <span className="mobile-count">{pool.length}</span>}</span><span>Learning</span>
        </button>
      </nav>

      {selection && selectionInfo && (
        <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelection(null) }}>
          <div className="word-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-expression" ref={sheetRef}>
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header">
              <span className="sheet-label">
                {selectionInfo.isPhrase ? 'PHRASE NOTES' : 'WORD NOTES'}
                <span> · {selectionInfo.isPhrase ? `${selectionInfo.components.length} WORDS` : selectionInfo.single?.entry.origin === 'glossary' ? 'YOUR GLOSSARY' : 'CC-CEDICT'}</span>
              </span>
              <button className="icon-button" onClick={() => setSelection(null)} ref={closeRef} aria-label="Close word notes"><X size={20} /></button>
            </div>
            <div className="expression-row">
              <h2 id="sheet-expression" lang="zh-CN">{selectionInfo.text}</h2>
              <p className="expr-pinyin">{selectionInfo.pinyin}</p>
            </div>
            <div className="extend-row" role="group" aria-label="Extend selection to a phrase">
              <button className="extend-button" onClick={() => extendSelection(-1)} disabled={!selectionInfo.canExtendBack} aria-label="Extend selection backward">
                <ChevronLeft size={17} aria-hidden="true" /> Back
              </button>
              <span className="extend-hint">{selectionInfo.isPhrase ? 'Phrase selected' : 'Select a phrase'}</span>
              <button className="extend-button" onClick={() => extendSelection(1)} disabled={!selectionInfo.canExtendForward} aria-label="Extend selection forward">
                Forward <ChevronRight size={17} aria-hidden="true" />
              </button>
            </div>
            {selectionInfo.single ? (
              <>
                {selectionInfo.single.entry.origin === 'glossary' && (
                  <p className="glossary-badge"><Sparkles size={13} aria-hidden="true" /> From your glossary</p>
                )}
                {selectionInfo.single.entry.note ? <p className="glossary-note">{selectionInfo.single.entry.note}</p> : null}
                <div className="sheet-section">
                  <h3>{selectionInfo.single.entry.entries.length === 1 ? 'MEANING' : 'MEANINGS'}</h3>
                  <ol className="sense-list">
                    {selectionInfo.single.entry.entries.map((sense, senseIndex) => (
                      <li key={senseIndex}>
                        <span className="sense-pinyin">{sense.pinyin}</span>
                        <span className="sense-defs">{sense.defs.join('; ')}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            ) : (
              <div className="sheet-section">
                <h3>WORDS IN THIS PHRASE</h3>
                <ol className="sense-list phrase-list">
                  {selectionInfo.components.map((component) => (
                    <li key={component.key}>
                      <span className="phrase-component"><span lang="zh-CN">{component.text}</span><span className="sense-pinyin">{component.entry.pinyin}</span></span>
                      <span className="sense-defs">{firstMeaning(component.entry)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="sheet-section sentence-section">
              <h3>IN THIS CLAUSE</h3>
              <p lang="zh-CN">{selectionInfo.clause}</p>
            </div>
            <button className={`primary-button save-button ${selectedIsSaved ? 'is-saved' : ''}`} onClick={selectedIsSaved ? () => unsaveWord(selectionInfo.id) : addToLearning}>
              {selectedIsSaved ? <Check size={19} aria-hidden="true" /> : <Bookmark size={19} aria-hidden="true" />}
              {selectedIsSaved ? 'Saved to learning' : selectionInfo.isPhrase ? 'Add phrase to learning' : 'Add to learning'}
              {selectedIsSaved ? <X size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
            </button>
            <p className="sheet-storage-note">{selectedIsSaved ? 'Tap again to remove it from your list.' : 'Saved locally with the clause above.'}</p>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false) }}>
          <div className="word-sheet settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header">
              <span className="sheet-label">READING SETTINGS</span>
              <button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={20} /></button>
            </div>
            <h2 className="settings-title" id="settings-title">Appearance</h2>
            <div className="sheet-section">
              <h3>THEME</h3>
              <div className="segmented" role="group" aria-label="Theme">
                {THEME_CHOICES.map((choice) => (
                  <button
                    key={choice.value}
                    className={settings.theme === choice.value ? 'active' : ''}
                    onClick={() => setSettings((current) => ({ ...current, theme: choice.value }))}
                    aria-pressed={settings.theme === choice.value}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              <p className="settings-note">Auto follows your device: light by day, dark by night.</p>
            </div>
            <div className="sheet-section">
              <h3>TEXT SIZE</h3>
              <div className="segmented" role="group" aria-label="Text size">
                {FONT_SIZE_LABELS.map((label, index) => (
                  <button
                    key={label}
                    className={settings.fontSize === index ? 'active' : ''}
                    onClick={() => setSettings((current) => ({ ...current, fontSize: index }))}
                    aria-pressed={settings.fontSize === index}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="settings-note settings-preview" lang="zh-CN">新质生产力 · 阅读舒适最重要</p>
            </div>
            <div className="sheet-section library-source">
              <h3>LIBRARY SOURCE</h3>
              <p className="settings-note">Packages in the private repository <strong>{GITHUB_REPO}</strong>, folder <strong>packages/</strong>. The token is stored only in this browser.</p>
              <label className="token-field">
                <span>GitHub token (read access)</span>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(event) => setGithubToken(event.target.value)}
                  placeholder="github_pat_…"
                  autoComplete="off"
                  aria-label="GitHub token"
                />
              </label>
              <button className="primary-button sync-button" onClick={syncGithub} disabled={syncing}>
                <RefreshCw size={16} aria-hidden="true" className={syncing ? 'is-spinning' : ''} />
                {syncing ? 'Syncing…' : 'Sync library'}
              </button>
              <p className="settings-note sync-note">{syncNote || (githubPackages.length > 0 ? `${githubPackages.length} GitHub ${githubPackages.length === 1 ? 'package' : 'packages'} cached in this browser.` : 'No GitHub packages yet. Sync once, then they work offline.')}</p>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{toast.text}</span>
          {toast.action && (
            <button className="toast-action" onClick={() => { toast.action?.run(); setToast(null) }}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default App
