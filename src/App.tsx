import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  CloudOff,
  Layers3,
  RotateCcw,
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

type SavedWord = {
  id: string
  sentence: string
  savedAt: string
}

type View = 'read' | 'learn'

const STORAGE_KEY = 'chinese-reader-test-v1'
const PACKAGE_URL = './packages/package-000001.json'

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

function displayText(key: string): string {
  return key.split('#')[0]
}

function firstMeaning(entry: LexiconEntry): string {
  return entry.entries[0]?.defs.join('; ') ?? ''
}

function readSavedWords(): SavedWord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is SavedWord => (
      typeof item === 'object' && item !== null &&
      typeof item.id === 'string' &&
      typeof item.sentence === 'string' && typeof item.savedAt === 'string'
    ))
  } catch {
    return []
  }
}

function App() {
  const [pkg, setPkg] = useState<StudyPackage | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [view, setView] = useState<View>('read')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [savedWords, setSavedWords] = useState<SavedWord[]>(readSavedWords)
  const [toast, setToast] = useState('')
  const [resetArmed, setResetArmed] = useState(false)
  const [online, setOnline] = useState(() => window.navigator.onLine)
  const [cacheReady, setCacheReady] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const selectedEntry = selection && pkg ? pkg.lexicon[selection.key] ?? null : null
  const selectedIsSaved = selection ? savedWords.some((word) => word.id === selection.key) : false

  useEffect(() => {
    let cancelled = false
    fetch(PACKAGE_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Package request failed with status ${response.status}`)
        return response.json() as Promise<StudyPackage>
      })
      .then((data) => {
        if (cancelled) return
        setPkg(data)
        // Drop saved words whose key is not in the loaded package's lexicon.
        setSavedWords((current) => current.filter((word) => word.id in data.lexicon))
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedWords))
    } catch {
      window.setTimeout(() => setToast('This browser could not save your learning list.'), 0)
    }
  }, [savedWords])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
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

  const switchView = (nextView: View) => {
    setView(nextView)
    setSelection(null)
    setResetArmed(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const addToLearning = () => {
    if (!selection || !selectedEntry) return
    if (selectedIsSaved) {
      setToast('This expression is already in your learning list.')
      return
    }
    setSavedWords((current) => [{ id: selection.key, sentence: selection.clause, savedAt: new Date().toISOString() }, ...current])
    setToast(`${selection.text} added to learning`)
  }

  const resetTest = () => {
    setSavedWords([])
    setSelection(null)
    setResetArmed(false)
    setToast('Saved words cleared. The article is still here.')
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
          <span>Chinese Reader<span className="brand-edition"> / test</span></span>
        </button>
        <div className={`connection-pill ${online ? '' : 'is-offline'}`} title="Connection and offline-cache status">
          {online ? <Wifi size={14} aria-hidden="true" /> : <CloudOff size={14} aria-hidden="true" />}
          <span>{connectionLabel}</span>
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
            <span className="nav-count">{savedWords.length}</span>
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
                      const isSaved = savedWords.some((word) => word.id === key)
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
                <div><strong>{savedWords.length}</strong><span>{savedWords.length === 1 ? 'expression' : 'expressions'} saved</span></div>
                <span className="local-badge">LOCAL TEST</span>
              </div>

              {savedWords.length === 0 ? (
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
                  {savedWords.map((saved) => {
                    const entry = pkg.lexicon[saved.id]
                    if (!entry) return null
                    return (
                      <article className="learning-card" key={saved.id}>
                        <div className="learning-card-top">
                          <div><h2 lang="zh-CN">{displayText(saved.id)}</h2><p className="card-pinyin">{entry.pinyin}</p></div>
                          <span className="saved-marker"><Bookmark size={15} fill="currentColor" aria-hidden="true" /> Learning</span>
                        </div>
                        <p className="card-meaning">{firstMeaning(entry)}</p>
                        <div className="card-context"><span>FROM YOUR READING</span><p lang="zh-CN">{saved.sentence}</p></div>
                      </article>
                    )
                  })}
                </div>
              )}

              <div className="test-controls">
                {!resetArmed ? (
                  <button className="text-button" onClick={() => setResetArmed(true)} disabled={savedWords.length === 0}>
                    <RotateCcw size={15} aria-hidden="true" /> Reset test data
                  </button>
                ) : (
                  <div className="reset-confirm" role="group" aria-label="Confirm reset">
                    <p>Clear all {savedWords.length} saved {savedWords.length === 1 ? 'word' : 'words'}?</p>
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
          <span className="mobile-learning-icon"><Layers3 size={21} aria-hidden="true" />{savedWords.length > 0 && <span className="mobile-count">{savedWords.length}</span>}</span><span>Learning</span>
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
              <p>{selectedEntry.pinyin}</p>
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
            <button className={`primary-button save-button ${selectedIsSaved ? 'is-saved' : ''}`} onClick={addToLearning} disabled={selectedIsSaved}>
              {selectedIsSaved ? <Check size={19} aria-hidden="true" /> : <Bookmark size={19} aria-hidden="true" />}
              {selectedIsSaved ? 'Saved to learning' : 'Add to learning'}
              {!selectedIsSaved && <ArrowRight size={18} aria-hidden="true" />}
            </button>
            <p className="sheet-storage-note">Saved locally with the clause above.</p>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status"><CheckCircle2 size={18} aria-hidden="true" />{toast}</div>}
    </div>
  )
}

export default App
