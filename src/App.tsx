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

type LexiconEntry = {
  text: string
  pinyin: string
  meaning: string
  category: string
  usage: string
  displayPinyin?: string
}

type Selection = {
  id: string
  sentence: string
}

type SavedWord = {
  id: string
  sentence: string
  savedAt: string
}

type View = 'read' | 'learn'

const STORAGE_KEY = 'chinese-reader-test-v1'

const LEXICON: Record<string, LexiconEntry> = {
  近年来: { text: '近年来', pinyin: 'jìn nián lái', meaning: 'in recent years', category: 'Time expression', usage: 'Placed at the start of a sentence to describe a trend or change over the past few years.' },
  中国: { text: '中国', pinyin: 'Zhōng guó', meaning: 'China', category: 'Proper noun', usage: 'A country name. It can stand alone or modify another noun, as in 中国城市 (Chinese cities).' },
  城市: { text: '城市', pinyin: 'chéng shì', meaning: 'city; urban area', category: 'Noun', usage: 'Refers to a city in general. Use 一座城市 when counting one city.' },
  开始: { text: '开始', pinyin: 'kāi shǐ', meaning: 'to begin; to start', category: 'Verb', usage: 'Follow with another verb to describe an action that starts: 开始 + verb.' },
  重新: { text: '重新', pinyin: 'chóng xīn', meaning: 'again; anew', category: 'Adverb', usage: 'Placed before a verb to show that something is done again or from a fresh perspective.' },
  思考: { text: '思考', pinyin: 'sī kǎo', meaning: 'to think about; to reflect on', category: 'Verb', usage: 'More deliberate than simply thinking. It can take an object directly: 思考 + question or issue.' },
  发展: { text: '发展', pinyin: 'fā zhǎn', meaning: 'development; to develop', category: 'Noun / verb', usage: 'Can describe economic, social or personal growth. Here it is a noun modified by 的.' },
  的: { text: '的', pinyin: 'de', meaning: 'structural particle: of', category: 'Particle', usage: 'Links a modifier to a noun. Here, 发展 modifies 意义: the meaning of development.' },
  意义: { text: '意义', pinyin: 'yì yì', meaning: 'meaning; significance', category: 'Noun', usage: 'Describes meaning or significance, often in the pattern …的意义 (the significance of …).' },
  政府: { text: '政府', pinyin: 'zhèng fǔ', meaning: 'government', category: 'Noun', usage: 'Refers to a governing administration. It can act as the subject of a sentence.' },
  希望: { text: '希望', pinyin: 'xī wàng', meaning: 'to hope; hope', category: 'Verb / noun', usage: 'As a verb, it is commonly followed by a clause describing the desired outcome.' },
  改善: { text: '改善', pinyin: 'gǎi shàn', meaning: 'to improve', category: 'Verb', usage: 'Used for making a situation, service or condition better: 改善 + condition.' },
  公共交通: { text: '公共交通', pinyin: 'gōng gòng jiāo tōng', meaning: 'public transport', category: 'Noun phrase', usage: '公共 means public and 交通 means transport. Together they refer to shared transport systems.' },
  增加: { text: '增加', pinyin: 'zēng jiā', meaning: 'to increase; to add', category: 'Verb', usage: 'Used before a noun for adding quantity, or intransitively for an increase.' },
  绿地: { text: '绿地', pinyin: 'lǜ dì', meaning: 'green space', category: 'Noun', usage: 'Describes parks, planted areas and other green land in an urban environment.' },
  推广: { text: '推广', pinyin: 'tuī guǎng', meaning: 'to promote; to spread', category: 'Verb', usage: 'Used for encouraging wider adoption of a product, practice or idea.' },
  清洁能源: { text: '清洁能源', pinyin: 'qīng jié néng yuán', meaning: 'clean energy', category: 'Noun phrase', usage: '清洁 (clean) modifies 能源 (energy), describing lower-pollution energy sources.' },
  让: { text: '让', pinyin: 'ràng', meaning: 'to let; to enable', category: 'Verb', usage: 'Introduces a result or enabled action: 让 + person or thing + verb.' },
  实现: { text: '实现', pinyin: 'shí xiàn', meaning: 'to achieve; to realise', category: 'Verb', usage: 'Used with goals, plans or ambitions: 实现 + goal.' },
  可持续发展: { text: '可持续发展', pinyin: 'kě chí xù fā zhǎn', meaning: 'sustainable development', category: 'Noun phrase', usage: '持续 means continuous and 发展 means development. It describes growth that can continue without exhausting resources.' },
  这种: { text: '这种', pinyin: 'zhè zhǒng', meaning: 'this kind of', category: 'Demonstrative', usage: 'Used before a noun to refer to a type already present in the context: 这种 + noun.' },
  转变: { text: '转变', pinyin: 'zhuǎn biàn', meaning: 'transformation; to transform', category: 'Noun / verb', usage: 'Describes a clear change in form, direction or attitude. It is a noun in this sentence.' },
  需要: { text: '需要', pinyin: 'xū yào', meaning: 'to need; to require', category: 'Verb', usage: 'Can be followed by a noun (need something) or a verb (need to do something).' },
  长期: { text: '长期', pinyin: 'cháng qī', meaning: 'long-term; over a long period', category: 'Adjective / adverb', usage: 'Placed before a noun or verb to describe something extending over a long time.' },
  投入: { text: '投入', pinyin: 'tóu rù', meaning: 'investment; to invest', category: 'Noun / verb', usage: 'Can refer to investing money, time or effort. Here it is a noun: long-term investment.' },
  也: { text: '也', pinyin: 'yě', meaning: 'also; too', category: 'Adverb', usage: 'Placed before the verb or predicate to add a parallel idea.' },
  每个人: { text: '每个人', pinyin: 'měi ge rén', meaning: 'everyone; every person', category: 'Pronoun phrase', usage: '每 means every and 个 is the general measure word. Often used with 都 in broader statements.' },
  积极: { text: '积极', pinyin: 'jī jí', meaning: 'active; positive', category: 'Adjective / adverb', usage: 'Before a verb, it means actively or enthusiastically: 积极 + action.' },
  参与: { text: '参与', pinyin: 'cān yù', meaning: 'to participate; participation', category: 'Verb / noun', usage: 'Used for taking part in an activity, project or decision, often with an object.' },
} as Record<string, LexiconEntry & { displayPinyin?: string }>

const PARAGRAPHS = [
  ['近年来', '中国', '城市', '开始', '重新', '思考', '发展', '的', '意义', '。'],
  ['政府', '希望', '改善', '公共交通', '，', '增加', '绿地', '，', '推广', '清洁能源', '，', '让', '城市', '实现', '可持续发展', '。'],
  ['这种', '转变', '需要', '长期', '投入', '，', '也', '需要', '每个人', '的', '积极', '参与', '。'],
]

function readSavedWords(): SavedWord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is SavedWord => (
      typeof item === 'object' && item !== null &&
      typeof item.id === 'string' && item.id in LEXICON &&
      typeof item.sentence === 'string' && typeof item.savedAt === 'string'
    ))
  } catch {
    return []
  }
}

function App() {
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

  const selectedEntry = selection ? LEXICON[selection.id] : null
  const selectedIsSaved = selection ? savedWords.some((word) => word.id === selection.id) : false

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
    setSavedWords((current) => [{ id: selection.id, sentence: selection.sentence, savedAt: new Date().toISOString() }, ...current])
    setToast(`${selectedEntry.text} added to learning`)
  }

  const resetTest = () => {
    setSavedWords([])
    setSelection(null)
    setResetArmed(false)
    setToast('Test data cleared. Your sample text is still here.')
  }

  const connectionLabel = !online ? 'Offline mode' : cacheReady ? 'Offline ready' : 'Local test'

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
                <div className="eyebrow">SAMPLE READING <span>/</span> 01</div>
                <h1 id="article-title">一座面向未来的城市</h1>
                <p className="english-title">A city built for the future</p>
                <div className="article-meta"><span>Synthetic text</span><span className="meta-dot" /> <span>Intermediate</span><span className="meta-dot" /><span>1 min read</span></div>
              </div>

              <div className="reading-tip">
                <Bookmark size={17} aria-hidden="true" />
                <span>Tap a word for pinyin, meaning and usage.</span>
              </div>

              <article className="chinese-article" lang="zh-CN">
                {PARAGRAPHS.map((paragraph, paragraphIndex) => {
                  const sentence = paragraph.map((id) => LEXICON[id]?.text ?? id).join('')
                  return (
                    <p key={paragraphIndex}>
                      {paragraph.map((id, tokenIndex) => {
                        const entry = LEXICON[id]
                        if (!entry) return <span className="punctuation" key={`${id}-${tokenIndex}`}>{id}</span>
                        const isSaved = savedWords.some((word) => word.id === id)
                        const isSelected = selection?.id === id && selection.sentence === sentence
                        return (
                          <button
                            className={`word ${isSaved ? 'is-saved' : ''} ${isSelected ? 'is-selected' : ''}`}
                            key={`${id}-${tokenIndex}`}
                            onClick={() => setSelection({ id, sentence })}
                            aria-label={`${entry.text}, explain this word${isSaved ? ', saved in learning' : ''}`}
                            aria-pressed={isSelected}
                          >
                            {entry.text}
                          </button>
                        )
                      })}
                    </p>
                  )
                })}
              </article>

              <div className="reader-footnote">
                <span className="tiny-check"><Check size={12} aria-hidden="true" /></span>
                Pinyin appears only when you ask for it.
              </div>
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
                  <p>Tap any unfamiliar word while reading, then save it with its sentence.</p>
                  <button className="primary-button empty-action" onClick={() => switchView('read')}>
                    <ArrowLeft size={17} aria-hidden="true" /> Explore sample text
                  </button>
                </div>
              ) : (
                <div className="learning-list">
                  {savedWords.map((saved) => {
                    const entry = LEXICON[saved.id]
                    return (
                      <article className="learning-card" key={saved.id}>
                        <div className="learning-card-top">
                          <div><h2 lang="zh-CN">{entry.text}</h2><p className="card-pinyin">{entry.displayPinyin ?? entry.pinyin}</p></div>
                          <span className="saved-marker"><Bookmark size={15} fill="currentColor" aria-hidden="true" /> Learning</span>
                        </div>
                        <p className="card-meaning">{entry.meaning}</p>
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
              <span className="sheet-label">WORD NOTES <span>· SAMPLE DICTIONARY</span></span>
              <button className="icon-button" onClick={() => setSelection(null)} ref={closeRef} aria-label="Close word notes"><X size={20} /></button>
            </div>
            <div className="expression-row">
              <h2 id="sheet-expression" lang="zh-CN">{selectedEntry.text}</h2>
              <p>{selectedEntry.displayPinyin ?? selectedEntry.pinyin}</p>
            </div>
            <p className="sheet-meaning">{selectedEntry.meaning}</p>
            <div className="sheet-section usage-section">
              <h3>HOW IT WORKS</h3>
              <span className="category">{selectedEntry.category}</span>
              <p>{selectedEntry.usage}</p>
            </div>
            <div className="sheet-section sentence-section">
              <h3>IN THIS SENTENCE</h3>
              <p lang="zh-CN">{selection.sentence}</p>
            </div>
            <button className={`primary-button save-button ${selectedIsSaved ? 'is-saved' : ''}`} onClick={addToLearning} disabled={selectedIsSaved}>
              {selectedIsSaved ? <Check size={19} aria-hidden="true" /> : <Bookmark size={19} aria-hidden="true" />}
              {selectedIsSaved ? 'Saved to learning' : 'Add to learning'}
              {!selectedIsSaved && <ArrowRight size={18} aria-hidden="true" />}
            </button>
            <p className="sheet-storage-note">Saved locally with the sentence above.</p>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status"><CheckCircle2 size={18} aria-hidden="true" />{toast}</div>}
    </div>
  )
}

export default App
