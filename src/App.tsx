import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  CloudOff,
  Copy,
  Layers3,
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

type Selection = {
  key: string
  text: string
  clause: string
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

type Toast = {
  text: string
  action?: {
    label: string
    run: () => void
  }
}

type View = 'read' | 'learn'

const POOL_KEY = 'chinese-reader-vocab-v1'
const SETTINGS_KEY = 'chinese-reader-settings-v1'
const PACKAGE_URL = './packages/package-000001.json'

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

function clauseAround(paragraph: PackageToken[], tokenIndex: number): string {
  let start = 0
  let end = paragraph.length
  for (let index = tokenIndex - 1; index >= 0; index -= 1) {
    if (CLAUSE_BOUNDARIES.has(paragraph[index].t)) {
      start = index + 1
      break
    }
  }
  for (let index = tokenIndex + 1; index < paragraph.length; index += 1) {
    if (CLAUSE_BOUNDARIES.has(paragraph[index].t)) {
      end = index + 1
      break
    }
  }
  return paragraph.slice(start, end).map((token) => token.t).join('')
}

function firstMeaning(entry: LexiconEntry): string {
  return entry.entries[0]?.defs.join('; ') ?? ''
}

function resolveTheme(choice: ThemeChoice): 'paper' | 'light' | 'dark' {
  if (choice !== 'auto') return choice
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
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

function App() {
  const [pkg, setPkg] = useState<StudyPackage | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [view, setView] = useState<View>('read')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [pool, setPool] = useState<PoolEntry[]>(readPool)
  const [settings, setSettings] = useState<Settings>(readSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [resetArmed, setResetArmed] = useState(false)
  const [online, setOnline] = useState(() => window.navigator.onLine)
  const [cacheReady, setCacheReady] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const selectedEntry = selection && pkg ? pkg.lexicon[selection.key] ?? null : null
  const selectedIsSaved = selection ? pool.some((entry) => entry.id === selection.key) : false

  useEffect(() => {
    let cancelled = false
    fetch(PACKAGE_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Package request failed with status ${response.status}`)
        return response.json() as Promise<StudyPackage>
      })
      .then((data) => {
        if (!cancelled) setPkg(data)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => { cancelled = true }
  }, [])

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

  const switchView = (nextView: View) => {
    setView(nextView)
    setSelection(null)
    setResetArmed(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const addToLearning = () => {
    if (!selection || !selectedEntry || !pkg) return
    const existing = pool.find((entry) => entry.id === selection.key)
    if (existing?.occurrences.some((occurrence) => occurrence.clause === selection.clause && occurrence.source === pkg.article.title)) {
      setToast({ text: 'Already in your learning list with this clause.' })
      return
    }
    const occurrence: Occurrence = { clause: selection.clause, source: pkg.article.title, savedAt: new Date().toISOString() }
    setPool((current) => {
      const match = current.find((entry) => entry.id === selection.key)
      if (match) {
        return current.map((entry) => entry.id === selection.key
          ? { ...entry, occurrences: [occurrence, ...entry.occurrences] }
          : entry)
      }
      return [{
        id: selection.key,
        word: selection.text,
        pinyin: selectedEntry.pinyin,
        meaning: firstMeaning(selectedEntry),
        occurrences: [occurrence],
      }, ...current]
    })
    setToast({ text: `${selection.text} added to learning` })
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
    setToast({ text: 'Saved words cleared. The article is still here.' })
  }

  const connectionLabel = !online ? 'Offline mode' : cacheReady ? 'Offline ready' : 'Local test'

  if (loadFailed) {
    return (
      <div className="app-shell">
        <main className="main-content package-status">
          <h1>Reading package failed to load</h1>
          <p>The file {PACKAGE_URL} could not be fetched. Connect once and reload; after the first visit the package is cached for offline reading.</p>
        </main>
      </div>
    )
  }

  if (!pkg) {
    return (
      <div className="app-shell">
        <main className="main-content package-status">
          <p>Loading reading package…</p>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => switchView('read')} aria-label="Chinese Reader home">
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
          {view === 'read' ? (
            <section className="reader-view" aria-labelledby="article-title">
              <div className="content-heading">
                <div className="eyebrow">READING PACKAGE <span>/</span> {pkg.package_id}</div>
                <h1 id="article-title">{pkg.article.title}</h1>
                <div className="article-meta"><span>{pkg.article.source_name}</span><span className="meta-dot" /><span>{pkg.article.date}</span></div>
              </div>

              <div className="reading-tip">
                <Bookmark size={17} aria-hidden="true" />
                <span>Tap a word for pinyin, meaning and usage.</span>
              </div>

              <article className="chinese-article" lang="zh-CN">
                {pkg.paragraphs.map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex}>
                    {paragraph.map((token, tokenIndex) => {
                      const key = token.w === 1 ? token.k ?? token.t : null
                      const entry = key ? pkg.lexicon[key] : undefined
                      if (!key || !entry) {
                        return <span className="punctuation" key={`${paragraphIndex}-${tokenIndex}`}>{token.t}</span>
                      }
                      const clause = clauseAround(paragraph, tokenIndex)
                      const isSaved = pool.some((saved) => saved.id === key)
                      const isSelected = selection?.key === key && selection.clause === clause
                      return (
                        <button
                          className={`word ${isSaved ? 'is-saved' : ''} ${isSelected ? 'is-selected' : ''}`}
                          key={`${paragraphIndex}-${tokenIndex}`}
                          onClick={() => setSelection({ key, text: token.t, clause })}
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
                Pinyin appears only when you ask for it.
              </div>
              <p className="dict-credit">Dictionary: CC-CEDICT (CC BY-SA 4.0). Entries marked “From your glossary” are your own corrections.</p>
            </section>
          ) : (
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
        <button className={view === 'read' ? 'active' : ''} onClick={() => switchView('read')} aria-current={view === 'read' ? 'page' : undefined}>
          <BookOpen size={21} aria-hidden="true" /><span>Read</span>
        </button>
        <button className={view === 'learn' ? 'active' : ''} onClick={() => switchView('learn')} aria-current={view === 'learn' ? 'page' : undefined}>
          <span className="mobile-learning-icon"><Layers3 size={21} aria-hidden="true" />{pool.length > 0 && <span className="mobile-count">{pool.length}</span>}</span><span>Learning</span>
        </button>
      </nav>

      {selection && selectedEntry && (
        <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelection(null) }}>
          <div className="word-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-expression" ref={sheetRef}>
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header">
              <span className="sheet-label">WORD NOTES <span>· {selectedEntry.origin === 'glossary' ? 'YOUR GLOSSARY' : 'CC-CEDICT'}</span></span>
              <button className="icon-button" onClick={() => setSelection(null)} ref={closeRef} aria-label="Close word notes"><X size={20} /></button>
            </div>
            <div className="expression-row">
              <h2 id="sheet-expression" lang="zh-CN">{selection.text}</h2>
              <p className="expr-pinyin">{selectedEntry.pinyin}</p>
            </div>
            {selectedEntry.origin === 'glossary' && (
              <p className="glossary-badge"><Sparkles size={13} aria-hidden="true" /> From your glossary</p>
            )}
            {selectedEntry.note ? <p className="glossary-note">{selectedEntry.note}</p> : null}
            <div className="sheet-section">
              <h3>{selectedEntry.entries.length === 1 ? 'MEANING' : 'MEANINGS'}</h3>
              <ol className="sense-list">
                {selectedEntry.entries.map((sense, senseIndex) => (
                  <li key={senseIndex}>
                    <span className="sense-pinyin">{sense.pinyin}</span>
                    <span className="sense-defs">{sense.defs.join('; ')}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="sheet-section sentence-section">
              <h3>IN THIS CLAUSE</h3>
              <p lang="zh-CN">{selection.clause}</p>
            </div>
            <button className={`primary-button save-button ${selectedIsSaved ? 'is-saved' : ''}`} onClick={selectedIsSaved ? () => unsaveWord(selection.key) : addToLearning}>
              {selectedIsSaved ? <Check size={19} aria-hidden="true" /> : <Bookmark size={19} aria-hidden="true" />}
              {selectedIsSaved ? 'Saved to learning' : 'Add to learning'}
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
