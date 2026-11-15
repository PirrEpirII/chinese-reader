# Chinese Reader Test

Technical handoff for the static browser compatibility test. Read the project note `30 Projects/Chinese Reader/Chinese Reader.md` in the owner's Obsidian vault (KB) first for the product architecture and owner decisions; since 2026-11-15 this code lives outside the vault in its own repository. This README covers the implemented code, local operation and verification boundary.

## Status update — 2026-11-15 22:50 (Claude_Leonid)

This section is newer than the rest of the file; where they disagree, this wins.

- The app is **published** at https://pirrepirii.github.io/chinese-reader/ by `.github/workflows/deploy.yml` on every push to `main`.
- The owner ran the **physical-iPhone check** (iOS 27.0, Safari): tapping, saving, reload persistence, Home Screen install and Airplane Mode all worked, by his report.
- The architecture changed (no Google Drive; GitHub for app and data; laptop-side text processing; personal glossary). The project note in the vault has the details and the task list for the next agent.
- `tools/` holds the laptop pipeline, a sample glossary and a sample package; see `tools/README.md`.
- Next work, in order: load packages in the app, save words with their clause, unsave, Copy as Markdown, then the Obsidian merge.

## Current status — 2026-11-15

- The local React/TypeScript/Vite test is implemented.
- Production build, lint and six Playwright/Chromium checks pass.
- The owner opened the laptop preview and reported that it looks okay. This was a visual smoke check, not full product acceptance.
- Physical-iPhone testing is deferred because the available setup felt too cumbersome. It was not failed and should resume only if the owner asks.
- No public deployment, production application or external integration exists.

The app contains one synthetic Chinese article and bundled sample dictionary entries. It makes no AI calls and does not read or write real Obsidian or Google Drive data.

## Quick start

The implementation was built and verified with Node.js `v24.21.0` and npm `11.12.1`.

From this directory:

```sh
npm ci
npm run dev -- --host 0.0.0.0 --port 7100
```

Open the local URL printed by Vite. The development server is for UI work; service-worker registration is intentionally production-only.

For a production build and local production preview:

```sh
npm run build
npm run preview -- --host 0.0.0.0 --port 7100
```

`npm run build` runs TypeScript, Vite and `scripts/stamp-sw.mjs`. The last step writes the explicit precache manifest into `dist/sw.js`. Do not edit `dist/` by hand; it is regenerated.

## Deployment (added 2026-11-15 by Claude_Leonid)

- Repository: https://github.com/PirrEpirII/chinese-reader (public). Site: https://pirrepirii.github.io/chinese-reader/
- `.github/workflows/deploy.yml` runs `npm ci` and `npm run build` on every push to `main` and publishes `dist/` to GitHub Pages. No local build is needed to deploy.
- One-time setup on github.com: Settings -> Pages -> Source -> GitHub Actions.
- All app paths are relative (`base: './'`, `./sw.js`, `./manifest.webmanifest`), so the app works under the `/chinese-reader/` sub-path without changes. The build was reproduced with Node 22 on 2026-11-15; the deployed site and physical-iPhone behaviour are not yet verified.

## Verification

Install Chromium once if this environment does not already have it:

```sh
npx playwright install chromium
```

Then run:

```sh
npm run lint
npm run build
npm test
npm audit --omit=dev
```

The Playwright configuration starts a managed production preview on `127.0.0.1:4173` and stops it after the tests. Do not leave a development or preview server running when finished.

Current six-test coverage:

1. Mobile reading, word help, adding, duplicate-safe saved state, reload persistence, learning list and reset/cancel/reset confirmation.
2. Sheet dismissal through the close button, backdrop and Escape, plus keyboard entry and focus restoration.
3. Offline reload with saved data, explicit built-asset cache assertions and the ordinary HTTP cache disabled.
4. Desktop reading and learning flow, console-error and 404 checks.
5. Responsive reading and sheet layout at 768 pixels.
6. Responsive reading and sheet layout at 1024 pixels.

Mobile and desktop screenshots are written to `test-results/` during verification. The primary mobile and desktop flows assert zero browser page errors and zero 404 responses. The last production dependency audit reported no vulnerabilities.

## File guide

```text
app-test/
├── README.md
├── package.json               # scripts and dependencies
├── index.html                 # viewport, manifest and iOS metadata
├── playwright.config.ts       # production-test server and Chromium settings
├── public/
│   ├── manifest.webmanifest   # Home Screen/PWA metadata
│   ├── sw.js                  # service-worker template; APP_SHELL is stamped at build
│   └── icons/                 # local 192px and 512px app icons
├── scripts/
│   └── stamp-sw.mjs           # generates the dist/sw.js precache list
├── src/
│   ├── App.tsx                # sample data, state, reader, learning list and sheet
│   ├── App.css                # responsive dark UI, touch targets and bottom sheet
│   ├── index.css              # colour/font tokens and global styles
│   └── main.tsx               # React entry and production service-worker registration
├── tests/
│   └── reader.spec.ts         # six automated browser checks
├── test-results/              # generated verification screenshots
└── dist/                      # generated static production output; Git-ignored
```

The initial Vite/shadcn template also left reusable components under `src/components/ui/`; this test does not depend on them for its main flow.

## Implemented learning loop

- Tappable pre-segmented Chinese words.
- Whole-expression pinyin, English meaning, category, usage note and original sentence.
- Bottom-sheet explanation UI on mobile and centred dialog on desktop.
- Add-to-learning action with duplicate prevention and visible saved state.
- Learning list preserving expression, pinyin, meaning and source sentence.
- Reset control with a confirmation/cancellation state.
- Browser-local persistence across reloads.
- Responsive layouts, 44px word/button targets, keyboard-operable dialog and reduced-motion handling.
- Web app manifest, icons and explicit offline app-shell caching.

## Local data and privacy

`localStorage` key:

```text
chinese-reader-test-v1
```

Each saved record contains:

```ts
{
  id: string         // key in the bundled LEXICON
  sentence: string   // original synthetic sentence
  savedAt: string    // ISO timestamp
}
```

The service-worker cache name is also `chinese-reader-test-v1`. Browser-local data is specific to its browser and origin, can be cleared, and is not a backup. Moving from a LAN HTTP address to an HTTPS address creates a different origin and therefore a different learning list.

No credentials, private articles, real vocabulary, Drive data or vault content belong in the public static package.

## Deliberate exclusions and unresolved work

- Physical-iPhone Safari, Home Screen, storage-eviction and Airplane Mode validation.
- Public/static deployment.
- Real article import, arbitrary link extraction and PDF/OCR processing.
- Runtime segmentation or a complete dictionary; current tokens and definitions are sample data.
- AI explanations, pronunciation and accounts.
- Google Drive transport and Obsidian merges.
- Spaced repetition, complete backup/restore and durable exports.

## Next-agent checklist

1. Read `../Chinese Reader.md` and preserve its frozen architecture unless the owner changes a requirement or a test fails.
2. Treat the owner's laptop comment as visual feedback only; do not claim iPhone acceptance.
3. Use the commands above to reproduce the build and browser checks before changing behaviour.
4. Edit source files, not `dist/`; rerun build and browser tests after changes.
5. Do not add a backend, paid service, real user data, external integration or deployment without owner approval.
6. Record new evidence and decisions in the project note and append the vault log when finished.
