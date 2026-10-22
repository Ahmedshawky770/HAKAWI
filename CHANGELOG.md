# Changelog

All notable changes to Hakawi are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Hakawi is pre-1.0, so
breaking changes are expected and are called out explicitly.

Versions are cut from `main`. The repository currently has no release tags; the initial release
number is left to the first tag rather than invented here.

## [Unreleased]

### Changed — the site wears its own logo

- **The mark is the real logo, not the placeholder that stood in for it.** `frontend/public/logo.png`
  is the product's logo — a magnifier whose lens is filled with the calligraphic `حكاوي`, a quill
  laid across it and a crescent over the rim — and the shell now draws it. The `ح`-on-amber tile
  that `components/layout/Brand.tsx` used to render is gone: it was a PLACEHOLDER for a logo that
  did not exist yet, drawn in the product's palette so the layout had something to hold, and a
  placeholder that outlasts the real thing is worse than no placeholder.
- **Every file that shows the logo is GENERATED from one piece of artwork**, by
  `frontend/scripts/generate-brand-assets.mjs` (`npm run brand:assets --workspace=frontend`).
  The artwork is the source; the mark in the shell, the browser icon, the apple-touch icon and
  the installable app's icons are its output, and the script is committed with them. Two copies
  of a logo that can drift apart is one copy too many, and a script that derives them is the
  only way to guarantee they cannot.
- **THE MARK IS DRAWN IN TWO VERSIONS, because the artwork is a PRINT.** The artwork is violet
  ink, a teal glass and gold leaf on cream paper, and it reads as it was drawn on the light
  canvas — and it does not read on the dark one, where the frame's violet ink sits at 1.15:1
  against the canvas, which is the frame disappearing. So `logo-mark-dark.png` and
  `logo-mark-light.png` are two prints of the same drawing, and the theme decides which one is
  drawn. The dark one is measured, not eyeballed: the generator prints the contrast of the
  shade that covers the most pixels of each family against the canvas it will be drawn on, and
  it prints it from the file that SHIPS — the violet frame at 3.6:1, the teal glass at 3.7:1,
  the gold at 11.5:1.
- **The mark is a CSS background, not an `<img>`.** The theme is resolved before the first
  paint, by the bootstrap in `src/lib/preferences.ts`, so the right version is known when the
  page is drawn — and only CSS can act on that moment. An `<img>` whose `src` follows the theme
  downloads the WRONG version first and the right one after hydration, and a browser fetches a
  hidden image whether it is wanted or not. A background image is fetched for the element that
  is actually painted, which is exactly one of the two.
- **The browser icon was the Next.js mark.** `frontend/src/app/favicon.ico` was the framework's
  starter icon — a white `N` on transparent — and it was the one place a browser showed the
  product's face. It is now the product's own icon: a real `.ico` carrying 16, 32 and 48 pixel
  entries, served at `/favicon.ico` by Next's file convention, so a browser that asks for it by
  name gets the brand instead of a 404. The emblem was 138KB as a favicon — a 512-pixel picture
  a browser downloads to draw sixteen of them; the icon is 7KB and is drawn at the size it is
  used at.
- **THE ICONS ARE PRINTED ON PAPER.** A favicon, an apple-touch icon and an installable app's
  icon are drawn by software that does not know what the product's theme is: iOS composites a
  transparent icon over BLACK, and the emblem's violet frame is invisible on black. So every
  icon carries the cream the artwork was drawn on, and the apple-touch icon is 180×180 — the
  size Apple's specification names — rather than 512.
- **The installable app has a maskable icon as well as an ordinary one.** A launcher masks an
  icon into a circle or a squircle and keeps only the middle 80% of the canvas, and this
  artwork draws its quill and its crescent right out to the edge of its frame on purpose. The
  maskable icon carries the mark at 58%, inside the safe zone, so the mask keeps the drawing
  whole.
- **The manifest's icon entry pointed at `/logo.png` while declaring `sizes: "512x512"`**, which
  the file is not (it is 1408×768, with the magnifier's handle running out of the frame — a
  launcher would crop it to a shape the artwork was never drawn as); it now declares the emblem,
  which is square.
- **The mark and the wordmark are both shown, and they are not the same thing.** The artwork
  carries the name in Arabic calligraphy — a logotype, which does not change with the language of
  the interface — while the wordmark beside it is the name in the reader's own script, `حكاوي` in
  Arabic and `Hakawi` in English. The emblem says "this is the mark"; the wordmark says "this is
  what it is called, in your language".

### Fixed — the dev environment's four console errors

The `npm run dev` console carried four errors that shared one root cause between them, and one
that did not.

- **A process holding the API's port produced "Cross-Origin Request Blocked … (Reason: CORS
  header 'Access-Control-Allow-Origin' missing)" for a CORS configuration that was correct.**
  The API could not bind `:3001` because something else already had it, and the browser went on
  talking to THAT process, which answered `200` with a JSON body and no CORS headers. The
  console named CORS; the defect was a port. `npm run dev` now checks both ports before it
  starts anything (`scripts/check-dev-ports.mjs`, also runnable on its own as
  `npm run check:dev-ports`) and reports the port, the PID and the command line of whatever
  holds it — and says, in the failure message, that the CORS errors are this and not a CORS
  misconfiguration. The API says the same thing when it is started on its own and finds the
  port taken: `backend/src/main.ts` now catches `EADDRINUSE` and names the port instead of
  letting a bare `EADDRINUSE` be the whole diagnosis. The message is FLUSHED before the
  process exits: a write to stdout is asynchronous when stdout is a pipe — which is what it
  is under a supervisor, in a container or in CI — and exiting on the same tick truncates the
  one line that says which port is busy.
- **THE DEV-PORTS CHECK CHECKED A PORT NOBODY BINDS.** The frontend's port was written in two
  places — the script that probes it and the `--port` flag the `dev:frontend` script passes to
  Next — and nothing made them agree. A check that probes a port nobody binds always passes, and
  it is worse than no check because it says the ports are free. The script now reads the root
  `package.json`, refuses to run when the two disagree or when the `dev` script does not run the
  check at all, and says which of the two is wrong.
- **The frontend's port is now passed explicitly (`next dev --port 3000`).** `next dev` reads
  `PORT` as well, so a `PORT` in the environment moved BOTH servers onto one port; and when
  Next's port is not given explicitly it does not fail on a busy port at all — it silently
  retries on the NEXT port, which for a busy `3000` is `3001`, which is the API's port. The
  explicit port makes Next fail loudly instead of drifting onto the API.
- **The Content-Security-Policy carried a source the browser could not parse.**
  `connect-src` named `https://*.s3.*.amazonaws.com`, and a CSP host source may carry a
  wildcard in its LEFTMOST label and nowhere else (CSP3 §2.3.1) — the second `*` was not a
  wildcard. Chrome refused the whole source ("Couldn't parse invalid host
  https://*.s3.*.amazonaws.com") and dropped it, so the policy that reached the page was
  NARROWER than the one that had been written and every upload was refused by a policy that
  allowed it. The storage origins are now `frontend/src/lib/storage-origins.ts`: the bucket
  stays a wildcard (its name is deployment configuration) and the region is spelled out, one
  entry per region, so every region is covered and every non-storage https host is still
  excluded. The list is read from one place, in the manner of `src/lib/paymob.ts`.
- **THE REGION LIST WAS INCOMPLETE AND TWO OF ITS ENTRIES WERE DEAD.** The list was written
  from memory; the endpoint data the AWS SDK ships (`@aws-sdk/core`, `partitions.json`) is the
  authority on which regions exist and what their hostnames look like, and it is in this
  repository's own `node_modules`. Compared against it, three regions were missing — `mx-central-1`,
  `ap-east-2` and `ap-southeast-6` — and the two China entries named the wrong suffix: the
  China partition's endpoints end in `amazonaws.com.cn`, so `https://*.s3.cn-north-1.amazonaws.com`
  could never match anything. A region missing from the list is a region where an upload is
  refused, and a region listed with the wrong suffix is a region where an upload is refused as
  well. The list now carries every region of the commercial, China, GovCloud and European
  Sovereign Cloud partitions, each with its own partition's suffix. A deployment that knows
  its own bucket can set `NEXT_PUBLIC_STORAGE_ORIGIN` and the list is replaced by that ONE
  origin — a strictly tighter policy and a much smaller header — and the value is VALIDATED
  at build time, because a malformed one is a legal single-label host source to a browser and
  would produce a policy that refuses every upload while claiming to allow it.
- **THE POLICY ALLOWED THE API ORIGIN TO BE NAMED, AND STAGING NAMED NEITHER.** `connect-src`
  listed two API origins — the dev server and the production ingress — while the staging
  deployment's API (`https://staging-api.hakawi.io`) was in neither of them, and the staging
  frontend is served from `staging.hakawi.io`, which `'self'` does not cover either. Every API
  call in staging was therefore refused by the policy before it reached the API, and the
  console said "refused to connect", which is a sentence nobody reads as "the policy is wrong".
  The origin is now DERIVED from `NEXT_PUBLIC_API_URL` — the same variable the client calls
  the API with — so the policy and the client cannot disagree about it, and a new environment
  is one build argument rather than an edit to a list that had already drifted.
- **`npm run verify:csp` now checks that every source in the served policy PARSES**, and reads
  the dev manifest (`.next/dev/routes-manifest.json`) as well as the build one — a dev-only
  mistake is the one that reaches a developer first. The parser lives in
  `frontend/scripts/csp-sources.mjs` and has its own suite, because a parser with no test is
  a coin flip between "misses the bug" and "fails the build for no reason". The parser follows
  the BROWSER's rules rather than the specification's alone: a wildcard port, a trailing dot
  and a label that begins with a dash are legal to Chrome and are legal here, and a bracketed
  IPv6 literal is refused by Chrome and is refused here. `trusted-types` and
  `require-trusted-types-for` take POLICY NAMES rather than sources, so they are not read as
  source lists — reading a working Trusted Types policy as a broken hostname would fail the
  build over it.
- **THE CSP CHECK SAID IT HAD CHECKED SOMETHING IT HAD NOT.** The build manifest is the
  artifact that ships, and the dev manifest is deliberately NOT held to the production rule —
  so a run that found only the dev manifest printed that the policy "blocks eval" while having
  checked nothing of the kind. The build manifest is now required, the summary names the
  manifests it read and the rules they were held to, and a dev manifest that PREDATES
  `next.config.ts` is reported and skipped, because it describes a policy the dev server is no
  longer serving.
- **The browser was told to preload fifteen font files and used three or four of them.**
  `next/font` emits a `<link rel="preload" as="font">` for every file of a face it is told to
  preload — every weight, of every subset the face was asked for — and the four faces of the
  design system are fifteen files between them (Amiri four, Cairo two, IBM Plex Sans Arabic
  eight, Inter one). The browser downloaded all fifteen and reported every file it did not
  use as "preloaded with link preload … was not used within a few seconds". The faces are a
  FALLBACK CHAIN (`--font-arabic-heading` is Amiri and then Cairo), so Cairo was preloaded on
  every page and drawn on none: it is only used when Amiri fails to load, and it never does.
  All four faces now declare `preload: false`, so the browser fetches a face when a rule
  actually asks for it — the same set of files the page was going to use, fewer of them, and
  no console noise. The cost is stated in `src/app/fonts.ts`: a face is discovered when the
  stylesheet carrying it is parsed rather than in parallel with it, and `display: "swap"` plus
  Next's fallback metrics keep the text readable and the layout stable while it arrives.

A 488-file change set was reviewed line by line and hardened. The full reasoning for every change
— including the trade-offs that were accepted rather than hidden — is in
[`docs/adr/005-security-and-correctness-hardening.md`](docs/adr/005-security-and-correctness-hardening.md).

### Frontend — bilingual chrome, accessibility, and a narrower CSP

- **The shell dictionary is now the whole chrome, not just the navigation.**
  `frontend/src/lib/i18n.ts` became `frontend/src/lib/i18n/`, namespaced `shell` / `common` /
  `auth` / `story`, so the auth flows, the story readouts and the search surface read from one
  table per locale instead of the navigation alone. Interfaces remain the source of truth — every
  key exists in both Arabic and English, in identical order — and the copy moved byte-for-byte,
  including the password-rule hint shown under the field on `register` and `reset-password` (and
  deliberately not on `login`, which has nothing to create a password for). The one later
  exception is that hint's Arabic-Indic `٨`, which the digit rule pinned to `8` — the entry below
  records it.
- **The skip link had a dead target on every authentication page.** The root layout renders the
  link first, but only `AppShell` owned `#main-content`; on `/login`, `/register`,
  `/forgot-password`, `/reset-password` and `/auth/error` the first Tab stop went nowhere.
  `AuthShell` now renders the `<main>` landmark those pages were missing — which is the correct
  shape for them regardless of the link.
- **The skip link learned the locale.** The anchor was a hard-coded Arabic literal sitting in the
  root layout, which cannot read `LocaleContext` without becoming a client component itself (it
  owns `<html>`). It is now `frontend/src/components/layout/SkipLink.tsx`, a leaf client component
  that renders `shell.skipToContent` in the active locale — and it must render *inside*
  `<Providers>`, because it consumes `LocaleContext`; as a sibling of them it would throw on every
  route. `frontend/src/app/layout.test.tsx` asserts the wiring, and `SkipLink.test.tsx` asserts the
  throw for the component itself.
- **The shared chrome became client components, and that is a rendering contract.** `Loading`,
  `ErrorMessage` (with `SuccessMessage`), `Avatar`, `Brand` and `StoryMeta` now read their labels
  from the dictionary through `useStrings()` / `useLocale()` instead of defaulting to Arabic, and
  `AuthShell` renders `Brand` — so each of them **requires `LocaleProvider`**: rendered bare they
  throw `useLocale must be used inside <LocaleProvider>` rather than rendering. Consumers and
  suites go through `renderWithProviders`, and the string keys themselves are covered by
  `frontend/src/lib/i18n/i18n.test.ts`.
- **The locale provider was destroying route titles.** Its effect mirrored the document title on
  mount, and a root provider's passive effect runs *after* the page's — so the four routes that
  ship their own `generateMetadata` (story comments and reactions, user followers and following)
  had their `<title>` overwritten in the client on every cold load. What replaced that effect is
  described by the two audit entries below; the interim fix this entry first credited itself with
  (skip the mount pass, write on a real toggle) was wrong, and is retracted where it says so.
- **Counts are no longer one phrase.** `.hk-numeric` is an LTR isolate, and a count is digits plus
  a noun, so the two are now split: `CountReadout` in `lib/i18n/common.ts` keeps them apart with
  one pluralization rule, the digits render inside the isolate and the noun stays in the sentence,
  matching the rule `lib/money.ts` already stated for amounts. (An earlier draft of this entry said
  the migration had wrapped whole Arabic phrases in the isolate on the story page and dropped it
  from the search count. Measured against `HEAD`, neither was true — the audit entry below records
  what the round actually changed.)
- **The two landmarks that shared one accessible name no longer do.** The sidebar `<nav>` and the
  discovery `<aside>` both resolved to `secondaryNavigation`; the rail now carries its own label.
- **`'unsafe-eval'` in the CSP is development-only.** React's development build calls `eval()`
  for its debug hooks, and the policy was paying for that in production, where nothing calls it.
  The flag is resolved when `next.config.ts` is *loaded* (Next transpiles and `require`s it), and
  the header itself is serialized into `.next/routes-manifest.json` at build time — so production
  keeps `eval` blocked. `next build --debug-prerender` was the one path that could leak the keyword,
  and the comment on the constant names it.
- **Half-migrated pages no longer mix languages.** An English reader was seeing Arabic error
  headings above an English "Retry" button on the story routes, and bilingual chrome next to
  Arabic descriptions on the stories list and the idle search state. The story pages' error
  titles, the list's descriptions and the filter label now come from the dictionary, and the copy
  that has no key is named as such in `shell.ts`'s own header rather than implied to be complete.
- **Tests assert behaviour, not literals.** The new title-mirroring effect
  (`TitleMirror.test.tsx`), the root layout's provider wiring (`frontend/src/app/layout.test.tsx`),
  the `useStrings` alias, the `AuthShell` landmark and the `StoryCategoryOptions` identity cache
  (`frontend/src/components/story/StoryCategoryOptions.test.tsx`) are covered, the English
  rendering of the header is asserted through a real locale toggle rather than a `lang` attribute
  check, and the Playwright specs derive their Arabic selectors from the application's own
  dictionary (`frontend/e2e/copy.ts`) instead of re-typing them — the two literals that have no
  dictionary key are commented as gaps, not hidden.

### Frontend — the same change set, corrected against a line-by-line audit

The eleven findings below were raised against the entry above and fixed in the same round, so the
change set that lands is the corrected one rather than the first draft of it.

- **The Arabic count tables used the wrong noun form for 100 and above.**
  `Intl.PluralRules("ar")` selects `other` for 100, 101 and every round hundred, and Arabic counts
  the noun in the SINGULAR there — so the reactions readout read "100 تفاعلات" and the search
  count read "١٠٠ نتيجة" beside a views count that said "100 مشاهدة". The `other` form is now
  singular in all three tables, the `many` form (11–99) is the accusative singular the money
  module's `formatDayCount` already states ("مشاهدةً", "تفاعلاً", "نتيجةً"), and
  `frontend/src/lib/i18n/i18n.test.ts` asserts both against `Intl`'s own selection so the tables
  cannot drift from the rule again. The same suite enforces the dictionary's key parity (both
  locales, identical order), that no string is empty, that no `record` value is undefined, and
  that no value in either locale carries an Arabic-Indic digit — the digit rule stated above,
  asserted where the copy lives.
- **The skip link still had a dead target on two more surfaces.** `/auth/callback` — the OAuth
  landing, whose failure state a reader can sit on with a live link — rendered a bare `div`, and the
  `(app)` layout's session guard rendered its probe and its retry surface the same way, both outside
  any landmark. Both now own `<main id="main-content" tabIndex={-1}`, in the same shape
  `AuthShell` uses, and each carries a test asserting the landmark exists in both of its states.
- **The focused skip link was unreadable, and axe could not see why.** `.hk-skip-link:focus-visible`
  painted `--hk-accent` with `--hk-accent-strong`, a token no theme defines, so the `color`
  declaration was invalid and the text fell back to the inherited ink: **1.91:1** on the dark canvas
  and 4.04:1 on the light one. It now paints `--hk-accent-fill` with `--hk-on-accent`, the pair the
  design system measures at 8.70:1 and 5.18:1; that pair is now a `REQUIRED_PAIRS` row in
  `design-system.test.ts`, and a new block in the same suite reads the stylesheet and fails if the
  skip link names a colour token no theme defines — the general form of the bug, which axe cannot
  catch because the link is clipped out of the accessibility tree until focus.
- **The locale provider's title mirroring was inverted.** The previous round's fix (skip the mount
  pass) left the effect overwriting the route's own `<title>` with the site name *on every
  toggle* — the behaviour it existed to remove — and the comment justified that by a premise that
  is false: the root metadata is static Arabic (`app/layout.tsx` cannot read the stored locale), so
  the server HTML is not "already in the active language". The mirror now asks the document who owns
  the title: the chrome's own (the app title in either locale, or nothing) is mirrored into the
  active language, and a title a route put there is left alone, because replacing it with the site
  name is not a translation.
- **The Arabic tab title came back after every client navigation.** Next re-applies the route's
  metadata on each route commit, and for a route that owns none of its own that metadata is the root
  layout's static Arabic title — so a reader who flipped to English and then clicked a nav link got
  `حكاوي` above an English page until the next full reload. Closing that needs the mirror to listen
  to the route, and `usePathname` in `LocaleProvider` would reach the 23 suites that mount the
  provider while mocking `next/navigation` without exporting it — a wrong hook for a `<title>`. So
  the mirroring moved out of the provider into `frontend/src/components/providers/TitleMirror.tsx`,
  a leaf the **root layout** renders, which reaches none of them: the one suite that renders the
  root layout (`frontend/src/app/layout.test.tsx`) mocks the mirror to assert the wiring instead of
  its effect. The provider is now nothing but `lang`, `dir`, the store and the dictionaries; the
  document is mirrored by a component whose only job is the document. The navigation regression is
  covered by a test that moves a mocked pathname and re-renders, which is the case nothing covered
  before.
- **Dates kept Arabic-Indic digits on both locales.** `toLocaleDateString("ar-EG")` renders
  Arabic-Indic digits, so the same surface showed "١٤ أكتوبر ٢٠٢٦" beside "1,234" views — the exact
  inconsistency `money.ts` documents deciding against for amounts. Every date in the product now
  goes through `lib/i18n`'s `formatDate` / `formatLongDate` / `formatTime` / `formatDateTime`, which
  pin the numbering system to Latin while leaving the month and weekday names in the reader's
  language: "14 أكتوبر 2026". `NotificationRow` had a comment claiming the row *could not* read the
  locale context because its test rendered it bare; that test now uses `renderWithProviders`, so the
  row follows the same rule — and its previous bare `toLocaleString()` was also a hydration hazard,
  since the runtime's default locale differs between Node and the browser.
- **The dashboard's counters and empty state were the last raw copy.** `(app)/page.tsx` summed
  totals with a bare `toLocaleString()` — which produces Arabic-Indic digits in an Arabic browser
  and a different string on the server than on the client — and rendered a second copy of
  "لا توجد قصص بعد" without the full stop the stories list uses. Both now come from the dictionary
  and `formatCount`. The idle search's suggestion words were a module constant above a fully
  translated page; they are `shell.searchSuggestions` now, in both locales.
- **`mainNavigation` still named two landmarks.** At `HEAD` the bottom bar's `<nav>` and the
  sidebar's primary `<nav>` resolved to the same label, separated only by a `display: none`
  breakpoint — the same shape of defect as the discovery rail's collision with
  `secondaryNavigation`, fixed in the round above. The bottom bar now carries
  `shell.bottomNavigation`, so the shell's three navigation landmarks each resolve to their own
  name.
- **Five category keys were a second path to one string.** `categoryAll`/`categoryFiction`/… were
  declared in `StoryStrings` and reachable through `strings.story.categoryFiction`, while every
  consumer reads the same words through `storyCategoryLabel`. They are now one per-locale table
  read by that function, so the category copy has one source instead of two.
- **The bidi claim did not survive auditing.** The entry above said the migration had wrapped whole
  Arabic phrases in `.hk-numeric` on the story page and dropped the isolate from the search count.
  Against `HEAD`, neither was true — the noun was already outside the span there, and the search
  count already carried the isolate. What the round actually changed is grouping
  (`toLocaleString` → `formatCount`) and pluralization; that is what the entry now says.
- **`next build` does not "force" `NODE_ENV=production`.** Against the installed Next 16.3.8
  (`next/dist/bin/next`), it assigns a default when the variable is unset and only *warns* when a
  set value disagrees; `--debug-prerender` forces `development`. The environmental guarantee is
  therefore not structural, which is why it now has the gate the previous entry said was missing:
  `frontend/scripts/verify-csp.mjs` reads every `Content-Security-Policy` header Next serialized
  into `.next/routes-manifest.json` and fails the build if any names `'unsafe-eval'`, if the header
  is missing, or if the manifest cannot be read. CI runs it after both builds — the route-type
  generation step and the deploy build.

### Frontend — the same change set, corrected against the pre-commit review

Six findings were raised against the entries above and fixed in the same round.

- **The CSP gate asserted the wrong build.** CI's `build` job ran its `Assert the built CSP keeps
  eval blocked` step on the CI runner's own `next build`, while the artifact that deploys comes
  from the `next build` inside `frontend/Dockerfile` — a second, unasserted build, because the
  deploy workflows re-run `docker build` from a fresh checkout rather than reusing the job's
  output. The image build now runs `verify:csp` immediately after its own build, so the shipped
  artifact is the one asserted; the CI step is kept as the fast failure, and its comment now says
  exactly that instead of calling itself the last gate before an image ships.
- **The root metadata was a second copy of the strings the title mirror compares against.**
  `app/layout.tsx` hand-wrote `حكاوي` / "منصة الحكاوي…" beside the dictionary, and `TitleMirror`
  recognizes the chrome's title by equality with `shell.appTitle`/`appDescription` — editing either
  copy silently disabled the mirror with every suite green. The metadata now reads
  `stringsFor("ar")`, so the dictionary is the only place the app title and description exist.
  (The `NODE_ENV`/Helm sentence in `next.config.ts` was also corrected: the chart's per-environment
  `nodeEnv` — `staging` in `values-staging.yaml` — is a runtime value that arrives after the header
  is serialized and never reaches the served policy, which is what actually makes it irrelevant.)
- **`Intl.PluralRules` was constructed per readout.** The search results count re-renders on every
  keystroke, so the readout allocated a formatter per keystroke for a locale set that never changes.
  The two rule sets are now module scope, the way `WESTERN_DIGITS` and the dictionaries already were.
- **The `all` category rows were unreachable.** The filter's "everything" value is `""` and the API
  only sends the four genre values, so both locale tables carried a second copy of the `""` row that
  no runtime path could read and only the new suite asserted. Removed; the suite asserts the empty
  key it actually reads.
- **Category labels were asserted as literals in the two suites that otherwise read the dictionary.**
  `StoryMeta.test.tsx` and `stories/[id]/page.test.tsx` now derive them through
  `storyCategoryLabel` — the same function the components use — so a dictionary edit moves the
  assertions with the UI instead of failing specs that never mentioned the copy. A dead ternary
  (`DEFAULT_LOCALE === "ar" ? "user-1" : "user-1"`) and its then-unused import were removed from
  `TitleMirror.test.tsx`.
- **The provider test named a guarantee it did not assert.** "keeps its own concern: the locale
  store, not the document title" only re-asserted the locale flip. It now captures the title around
  the flip and asserts it is untouched, which is the assertion that fails if a title-writing effect
  ever returns to the provider.

Verified after this round: **frontend 958 tests in 78 files** pass, `tsc --noEmit` is clean, and
`eslint` reports 0 errors. The pre-existing warning in the generated `frontend/coverage/` artifact
is untouched, and no `--fix` was run anywhere.

### Frontend — the same change set, hardened against the pre-commit review

Seven findings were raised against the entries above in pre-commit review and fixed before the
change set landed, so nothing here is post-hoc: the tree as committed carries the corrected code.

- **`StoryCategory` was re-casing the dictionary's own label.** Both variants carried Tailwind's
  `capitalize`, which was harmless while the label was the raw wire value (`non-fiction`) and
  harmful the moment it became the localized one: `text-transform: capitalize` uppercases the
  first letter of every word, so the English reader saw "Non-Fiction" where the dictionary — the
  one place the copy lives — says "Non-fiction". The class is gone from both variants and the
  component's header now states that casing is the dictionary's job.
  `StoryMeta.test.tsx` asserts the English label verbatim, in the English locale, through the real
  provider, which is the only way the corruption was visible.
- **`verify-csp.mjs` read half the manifest and scanned too much of it.** Next serializes route
  rules into TWO arrays and serves both — `headers` for unconditional rules and `onMatchHeaders`
  for rules carrying `has:`/`missing:` — so a policy written only into the second was never read,
  and the gate could pass on a build it had not looked at. The forbidden check is also
  directive-scoped now: it walks the fallback chain that actually decides whether `eval()` may run
  (`script-src-elem` → `script-src` → `default-src`, and the same for `script-src-attr`) instead of
  substring-scanning the whole policy, which used to fail a correct build whose `connect-src`
  named a host like `https://unsafe-eval.example.com`.
- **The CSP guarantee is structural, not environmental.** The frontend builder stage now sets
  `ENV NODE_ENV=production` immediately after `npm ci` — after it, because `npm ci` reads
  `NODE_ENV=production` as "skip devDependencies" and this build needs them (`@tailwindcss/postcss`
  compiles `globals.css`). Placed there, it decides the value `next.config.ts` reads at config-load
  time inside the image, rather than inheriting it from Next's default; `verify:csp` after the
  build still asserts the artifact that ships, so it is belt-and-braces rather than the only check.
- **The CI step's comment claimed a job it does not have.** It described itself as the last gate
  before an image is shipped; the deploy workflows re-run `docker build -f ./frontend/Dockerfile .`
  from a fresh checkout and never reuse the `build` job's output, so what the step actually buys is
  speed and precision — a ~25-minute pull request failing here instead of a policy that allows
  `eval` reaching an image build or a registry. The comment now says that, and names the job and
  the step. `.dockerignore` was made to match: `frontend/scripts/` is documented as build-EXECUTED
  rather than merely copied, and the `!frontend/scripts` / `!frontend/scripts/**` guards are placed
  after every exclusion they could contradict, because Docker matches in order and a later
  negation only wins over an earlier match.
- **The login button was queried by the page's heading copy.** Both Playwright specs clicked
  `copy.auth.loginTitle` to submit the form; the button's own copy is `copy.auth.loginButton`, in
  both locales, and the two are separate dictionary keys. The heading selectors stay on
  `loginTitle`, where they belong. The two values coincide today, so nothing was visibly wrong —
  but the day the heading and the button diverge, or the button is shortened to "Sign in", the
  click would miss.
- **The story forms were still half-migrated, and the dictionary now covers them.**
  `stories/create` and `stories/[id]/edit` read 24 new `story` keys, with the Arabic column
  byte-identical to the literals it replaces (verified string by string), so the two pages render
  in the active locale with no Arabic left in either file. Alongside them: `lib/i18n/index.ts`
  re-exports all four `*Strings` types, `passwordHint`'s Arabic-Indic `٨` became the Latin `8` —
  the digit rule the rest of the product follows — and `i18n.test.ts` grew the two invariants that
  keep it so (no Arabic-Indic digit in any value, no undefined record value).
- **The category options cache finally has a suite.**
  `frontend/src/components/story/StoryCategoryOptions.test.tsx` asserts what the module's header
  claims: both option lists are the very same array on every call for a locale, each entry is
  labelled through `storyCategoryLabel`, and the filter list leads with the empty key the filter
  actually reads rather than an unreachable `"all"` row.

Verified after this round: **frontend 975 tests in 79 files** pass, `tsc --noEmit` is clean, and
`eslint` reports 0 errors. The pre-existing warning in the generated `frontend/coverage/` artifact
is untouched, and no `--fix` was run anywhere.

### Security — fixed

- **Apple `id_token` was verified with the application's own HS256 secret.** Apple sign-in could
  never have succeeded, and the check that made it fail was not the check that made it safe: no
  `iss` and no `aud` verification meant that if it had ever been relaxed, any token this
  application mints for any subject would have been accepted as a valid Apple login. Now verified
  against Apple's JWKS with issuer and audience both required.
- **The refresh-token blacklist used the bearer token as its Valkey key**, exposing usable refresh
  tokens through RDB/AOF dumps, `MONITOR`, `SLOWLOG`, `SCAN` and replicas. The key is now a sha256
  of the token.
- **The blacklist TTL was a literal 7 days** while the token lifetime came from configuration, so
  `REFRESH_TOKEN_EXPIRY=30d` produced a 23-day window in which a revoked token was valid again.
  The TTL is now derived from the configured expiry.
- **A ban could be walked out of and walked back into.** `refreshTokens` never checked
  `accessBlocked`, so a blocked user kept minting access tokens for up to seven days; and OAuth was
  the one front door with no ban check, so a blocked user could sign in again through any of the
  five providers. Both are now refused.
- **`ENCRYPTION_KEY` accepted the published `.env.example` placeholder in production.** That key
  encrypts and compares password-reset tokens, so a deployment that copied the example and changed
  only the two JWT secrets ran with a known reset-token key. The published-secret rule is now
  shared by the JWT and encryption configurations.
- **500 responses returned internal error messages**, putting SQL fragments, table and column
  names, and internal paths in the response body. The body is now generic; logs and Sentry still
  receive the real message.
- **Moderation admin routes were reachable by any authenticated user.** The deleted
  `admin-dashboard.controller` declared `@RequireAdminRole` but omitted `RolesGuard` from its guard
  array, so the metadata was read by nothing. The routes now run an enforced guard chain.
- **Metrics endpoints were unauthenticated**, sitting outside the Nest routing tree. They are now
  behind `JwtAuthGuard` + `RolesGuard` + `SUPER_ADMIN`.
- **`@RequirePermissions(A, B)` granted on either permission.** The requirement now carries its
  mode as data: `@RequireAllPermissions` is AND, `@RequireAnyPermission` is the only route to OR.
- **`OwnershipGuard` was applied to zero routes**, so the IDOR it was written for was fully open.
  It is now wired on comment and story mutation routes through per-module repository resolvers.
- Password-reset token comparison now uses `crypto.timingSafeEqual` instead of `!==`.
- JWT signing and verification now pin `algorithms: ['HS256']`.

### Security — hardened

- **Four WAF rules matched ordinary prose and could trigger a one-hour IP block.** Verified
  examples included `"steps & id check"`, `"the book made me sleep( a lot"`, `"(uid=*) group"` and
  `"Please confirm( your email address"`. The *patterns* were tightened rather than the severities
  lowered, because downgrading would have traded a false positive for a silent loss of detection.
  Result: 0 false positives on a 26-prose corpus with 0 missed attacks on a 40-attack corpus.
- **SSRF rules could not match the encodings they implied.** Added coverage for link-local
  `169.254/16`, CGNAT `100.64/10`, IPv6 ULA, IPv6 link-local, IPv4-mapped IPv6 loopback, the
  inet_aton short forms, and the decimal/hex/octal integer encodings of `127.0.0.1`.
- **The body-size limit was bypassable with `Transfer-Encoding: chunked`,** and the rule's own
  description claimed it rejected an oversized upload "without being buffered" when the body had
  already been parsed. The detection control was rewritten and the description now states which
  control detects and which one prevents.
- **Percent-decoding ran exactly twice**, leaving triple-encoded payloads intact. It now runs to a
  fixed point, bounded.
- **`WAF_ENABLED=false` did not disable the WAF** — the blocklist lookup ran first, costing a
  Valkey GET per request even when the WAF was off.
- **A global rate-limit override was one stray variable away from silently disabling rate
  limiting in production.** It now requires an explicit acknowledgement and is fatal under
  `NODE_ENV=production`.
- Token refresh no longer shares the human login rate-limit budget. A dedicated `session` tier
  prevents ten automatic refreshes behind one office NAT from logging out every user behind it.
- The rate-limit default was corrected from an accidental 10× loosening (100/min) to 30/min.
- `.env.example` documented `TIKTOK_CLIENT_ID` and `FACEBOOK_CLIENT_ID` where the code reads
  `TIKTOK_CLIENT_KEY` and `FACEBOOK_APP_ID`, and omitted all five OAuth callback URLs, so every
  provider silently fell back to `localhost` in production.
- `next@16.3.5` carried a critical remote-code-execution advisory (`GHSA-vcvr-r3jv-pc5j`,
  `next/og` `ImageResponse`). Upgraded to `16.3.8`; `npm audit --omit=dev` is now clean.
- `@playwright/test` and an unimported `@nestjs/observe` were in production dependencies.
  `@nestjs/testing` was in the root production tree.

### Fixed

- **A completed Paymob capture delivered nothing, because the webhook destroyed the only record of
  what was bought.** `handlePaymobWebhook` wrote `metadata: JSON.stringify(decoded)` — the
  gateway's raw delivery — over the payment's own `metadata`, which `paymobInitializePayment` had
  stored as `{ bookId, type: 'purchase' | 'rental', durationDays }`. It did so *before* emitting
  `payment.completed`, and `LibraryEventHandler` / `RentalsEventHandler` read the row back at that
  moment to grant the entitlement: they found the webhook payload instead, classified it as
  "not a purchase" / "not a rental", and returned silently. The money was captured and the shelf
  stayed empty, and the state was unrecoverable through the API — a redelivery is refused as
  `already_processed`, and a manual status flip cannot transition `completed → completed`. The
  update no longer carries `metadata` at all, so the purchased-what survives; the gateway's
  delivery is recorded verbatim in its own place, a `payment_transactions` row (`type: 'webhook'`,
  `gateway_response` = the raw body). A regression test asserts the update payload exactly, not
  with `objectContaining`, so the omission is itself pinned.
- **Any authenticated account could rent a paid book for free.** `POST /rentals` created an ACTIVE
  rental with no payment, no price check and no duration validation — the entitlement for the price
  of one request. The payment-first redesign had routed `POST /books/:id/rent` through a Paymob
  checkout and left this second door standing, and the test suite kept it greased. The route, the
  service method, its DTO and request type, and the unused client are removed; `POST /rentals` is
  pinned to a 404 by both the controller spec and the e2e suite. A rental now exists only after
  money moved: the checkout's metadata describes what was bought and `RentalsEventHandler` writes
  the row on `payment.completed`.
- **Any authenticated account could download the file of any book.** `POST /books/:id/download`
  authenticated the caller and then returned the file URL of anything in the catalogue — paid or
  not — because nothing on the route asked what the caller had acquired. The route now sends the
  caller's identity into the service, and `BooksService.recordDownload` answers the real question
  before handing anything over: free, owned (a `library` row — read through the library module's
  own interface), or inside a live rental (answered by `RentalsService.findActiveRentalForBook`,
  which judges access by the end date rather than by a status word no clock maintains). A refusal
  names the way out — buy it or rent it — and counts nothing. Ownership-conditional write paths
  elsewhere are unchanged.
- **A paid rental never reached the shelf.** `RentalsEventHandler` recorded the rental on
  `payment.completed`, but no subscriber joined a rental to a `library` row, so `status: 'rented'`
  was a vocabulary value nothing ever wrote and the book the reader paid for was invisible in
  "مكتبتي" — and had no row for the access checks to find. `LibraryEventHandler` now subscribes to
  `rental.created` and writes the entry (idempotent twice over: once for the rental, once for the
  book, so a replay cannot duplicate and ownership is never demoted into a lease), and withdraws it
  on `rental.returned` or `rental.expired`, found by the rental's own id through the new
  `ILibraryRepository.findByRentalId`.
- **A seven-day ban was lifted after twenty-four hours.** `ModerationService.takeAction` wrote
  `user_restrictions.expires_at` from the moderator's `durationMinutes`, while
  `ModerationEventHandler` wrote the enforcement key `restriction:<userId>` in Valkey with a fixed
  TTL — 24h for a ban, 30d otherwise — and `RestrictionGuard` reads Valkey only. The duration the
  moderator chose was the duration the audit trail displayed and not the duration that was
  enforced. Both stores now read their vocabulary and their lifetime from `restriction-policy.ts`:
  the action carries `durationMinutes` on `moderation.action.taken`, the service's `expires_at` and
  the handler's TTL are the same computed value by construction, and the handler no longer writes
  its own audit row — the service is the single writer of `user_restrictions` (Principle #9), which
  removes the second writer whose expiry rule could never agree with the first.
- **A soft-deleted account's email or username could never be reused, but the service acted as if
  it could.** `users_email_unique` and `users_username_unique` are plain UNIQUE indexes on the
  column, so soft delete keeps both pinned just as firmly as a live row (Principle #6 — no partial,
  soft-delete-aware index was added). `UsersService.create` and `update` nonetheless gated their
  uniqueness pre-checks on `!existing.deletedAt`, let a registration or profile edit aimed at a
  soft-deleted account past the boundary, and lost to the very index the check was told to ignore —
  surfacing a raw driver error as an opaque 500 where the honest answer is a 409. The pre-checks now
  treat any existing row — live or soft-deleted — as a conflict, with the same `409` and message for
  both, so the response never leaks whether the holder was an active or a deleted account. The
  pre-existing `23505` guard is kept as the race-condition residual, and the repository lookup that
  still returns soft-deleted rows is unchanged.
- **Top-level comments were always empty.** `eq(comments.parentId, null)` compiled to
  `parent_id = NULL`, which SQL evaluates to `NULL` and is therefore never true. Now uses
  `isNull(...)`, and the row query and count query share one predicate so page and count cannot
  drift.
- **Migrations could be executed out of order.** With `0000` applied, `0001` pending and `0002`
  applied, the drift check compared against a running maximum and let `0001` pass — so `0001` ran
  *after* `0002`. The repository has a live sequence gap at 0017, so this was reachable. The applied
  migrations must now form a prefix of the file order.
- **Two concurrent `migration:run` invocations had no mutual exclusion**, which can raise a
  duplicate-key error on `pg_type` or deadlock. `up` and `down` now take a session advisory lock.
- **A blocked migration hung with no diagnostic.** Each migration transaction sets a lock timeout
  and a statement timeout.
- **The entire migration history reported the same application date**, because adding `applied_at`
  backfilled every legacy row with the adoption timestamp. The real `executed_at` is now restored.
- **The search count query used a different `tsvector` configuration than the rows query**, so
  `total` did not match the results and pagination was wrong whenever stemming changed a match.
- **The WebSocket adapter read `REDIS_*` while everything else read `VALKEY_*`.** Under Docker
  Compose the cache connected correctly while the adapter fell back to `localhost:6379` — silent
  loss of cross-instance event fan-out. The connection is now resolved once, from shared config.
- **Non-atomic `INCR` + conditional `EXPIRE`** in the WAF violation counter and the throttler
  storage could orphan a key with no TTL. For the WAF counter, which only rises, that meant a
  **permanent block with no expiry and no recovery**. Both now use a Lua script that establishes the
  counter and its TTL in one atomic step, without sliding the window forward.
- The OAuth CSRF state write is now awaited, so a callback cannot race it and a Valkey failure is
  no longer an unhandled rejection.
- `db:studio` had never worked: `drizzle-kit` and `dotenv` were imported by `drizzle.config.ts` and
  declared in no package.json. Both are now declared.
- `backend/push-schema.ts` — a divergent third schema bootstrap creating a table that does not
  exist in the Drizzle schema — was deleted.
- The frontend dashboard route `/dashboard` was a dead link; it pointed at a route that never
  existed.
- **The Terraform configuration could not initialize at all, so no apply had ever been possible.**
  The `eks`, `s3` and `monitoring` modules declared the same outputs twice (`main.tf` *and*
  `outputs.tf` — 15 collisions), and removing them exposed a further layer of schema errors the
  duplicates had masked: `taints` as a list where the AWS provider expects `taint {}` blocks on the
  node group, `enable_cloudwatch_logs_exports` (RDS), `log_destination_type = "cloudwatch-logs"`
  (VPC flow logs), the `cors_rule`/`rule` argument blocks (S3), `replication_group_description`,
  `number_cache_clusters` and `auth_token_enabled` (ElastiCache), a wrong relative rules path and
  an invalid `lifecycle { enabled }` (monitoring). `terraform init`/`validate` now exit 0, and the
  generated lock file is tracked while `.terraform/` is now ignored.
- **The frontend Helm chart could not load.** `Chart.yaml` carried `tags` as a YAML list where
  Helm's schema requires a string, so `helm lint`, `helm template` and `helm upgrade` all failed at
  exit 1 before reading a single template. The same chart's `env.db.host` required-guard was
  removed: no rendered manifest consumes that key — a render is byte-identical with any value —
  so the guard was copy-paste residue from the backend chart and only ever failed renders.
- **Terraform CI never linted anything.** It installed tflint by piping a `master` install script
  that upstream had deleted (the 404 page ran as bash: `404:: command not found`, exit 127), so
  `fmt`, `validate` and the three environment `plan`s never executed. The install is now pinned to
  release v0.58.0 with checksum verification.
- **The deploy bootstrap deadlocked and could never have worked.** `infrastructure/scripts/setup-iam.sh`
  derived the IAM OIDC provider from an EKS cluster that did not exist (`hakawi-dev-eks`, a name
  the `eks` module never produces), made the deploy role trust that *EKS* issuer with a
  *Kubernetes service-account* subject condition, defaulted `GITHUB_REPO` to a repository that is
  not this one, and shipped a bogus thumbprint. The GitHub Actions issuer is a fixed public URL,
  not a per-cluster ARN, and the trust condition is now `repo:<owner>/<repo>:*`. The script is
  idempotent, creates the state buckets and lock tables both naming conventions in the repository
  already reference, and computes the provider thumbprint at runtime.

### Changed

- Lint and format are now **checkers**, not mutators: `eslint` without `--fix` and
  `prettier --check`. Both are CI gates now.
- `test-e2e` and `test-browser` are now dependencies of the `build` job, so a green build can no
  longer be published on top of red browser tests.
- CI's `migration-verify` job was renamed **Migration Smoke Test (from scratch)**. It previously
  applied migrations to a fresh database and then verified the ledger it had just written — a
  tautology. It now also re-applies the chain, which is a real assertion: every migration is
  self-contained, in order, and idempotent.
- `migration:status` and `migration:verify` no longer run ledger DDL, so they no longer require
  write privileges on a production database.
- `migrations/drizzle-draft/` is now gitignored, so generated drafts cannot be mistaken for real
  migrations.
- The WAF's own known limits are now written down in `backend/src/common/waf/README.md` instead of
  being left for a reader to discover.

### Added

- A fifth rate-limit tier, `session`, for machine-driven token refresh.
- `AppleJwksService` with in-process key caching and rotation support.
- `ValkeyService.incrWithTtl` — an atomic counter-with-TTL primitive, replacing two separate
  copies of the same non-atomic pattern.
- Shared configuration for the published-secret rule, and a shared Valkey connection resolver.
- 22 environment variables that the code read but `.env.example` omitted; the 18 that are
  documented but read by nothing are now marked as such in the file.
- Regression tests for every fix above, including the sandwiched-migration case, the SSRF encoding
  bypasses, the WAF prose corpus, Apple `id_token` verification against real RSA keys, and the
  constant-time reset-token comparison.
- The `dev` and `staging` GitHub deployment environments the deploy workflows reference (only
  `production` existed, so `environment: dev`/`environment: staging` resolved to nothing), and the
  `develop` branch that `deploy-dev.yml` triggers on.

### Fixed — critical business-logic defects, verified end to end

Seven defects that made published product behaviour false. Each was confirmed against the current
tree before it was fixed, and each closes a case where the code asserted one thing and did another.

- **A refund was a payment that bought nothing back.** `PaymentsRefund` reached the gateway,
  returned the money, moved its row to `processed` — and the reader kept the book forever.
  `refund.created`/`refund.completed` were events with no producer and no consumer, so nothing on
  that path asked the library for anything. `refund.completed` is now emitted at the refund's
  terminal success (never while the gateway still says `pending`, so a not-yet-settled refund
  cannot revoke access that may have to be restored) and consumed in the two modules that own the
  answer: `LibraryEventHandler.handleRefundCompleted` removes the `owned` entitlement through the
  service's existing delete path, and `RentalsEventHandler.handleRefundCompleted` expires the
  rental, invalidates its cache and emits `rental.expired`. Both are idempotent by a
  pre-existence check, so a replayed delivery is a no-op rather than a 500. A `rental_extension`
  refund is deliberately not auto-reverted: undoing it means restoring a prior end date and
  unwinding another payment's increment, which is reconciliation, not a webhook.
- **Email verification could never succeed.** The minted token was `randomInt(10000000,
  100000000)` — always **eight** digits — while `VerifyEmailDto` enforces `@Length(6, 6)` and the
  global `ValidationPipe` rejects anything else. Every code ever sent to a user failed validation
  before the verifier ran. The generator now mints exactly six digits, keeping the DTO, the README
  and the codes in inboxes the contract.
- **No verification or password-reset email was ever sent.** `email.verification.requested` and
  `password.reset.requested` carried no token, had no listener, and `forgotPassword` stored a
  reset token nobody could receive — while both flows answered “sent”. The SMTP transport now
  lives in `common/email/` behind one `EmailTransporter` token (the duplicate configuration was
  the bug), the mints send through it directly in the request path, and the response derives from
  the outcome instead of claiming a delivery that did not happen. Tokens never enter an event
  payload or a log line. Extracting the token also repaired `NotificationsEmailService`, which
  had declared `@Optional()` on a bare interface token and therefore resolved to `undefined` —
  its “not configured” warning had been firing on every notification email in every deployment.
- **A ban did not block login, only everything after it.** `AuthService` checked
  `users.accessBlocked`, a column nothing in `backend/src` ever writes; the ban actually lands in
  `user_restrictions` and the `restriction:<userId>` cache key that `RestrictionGuard` reads.
  `login`, `refreshTokens` and `findOrCreateOAuthUser` now ask the same reader the guard uses
  (`AccountRestrictionService`, one implementation for both — Principle #9), and only `ban`
  refuses authentication: a mute is a write restriction, and refusing login would turn it into an
  account lockout the moderator did not impose. A Valkey driver error fails open at both points,
  logged at ERROR and bounded by the outage.
- **The `content_removal` moderation action removed nothing.** `takeAction` recorded the decision
  and emitted `moderation.action.taken`, and nothing anywhere deleted or hid the reported story or
  comment; the delete routes are `JwtAuthGuard + OwnershipGuard`, so a moderator had no path to
  take it down either. The action now loads the report first (an unknown id answers 404 instead
  of surfacing the `report_id` foreign key as a 500) and, for a content-bearing target, emits
  `moderation.content.removed`, which the stories and comments modules consume through their own
  delete paths — soft delete, counters, cache invalidation and downstream events included — so
  there is still exactly one code path per module that deletes content, and a moderator's removal
  reuses it instead of forking it (Principles #7, #9). An absent or already-deleted target is a
  no-op, not a failure.
- **Bans and mutes were enforced on the admin surface and on none of the routes users actually
  write to.** `RestrictionGuard` was reachable through `@Secured` only; every regular-user write
  route carried raw `@UseGuards(JwtAuthGuard)`, so a banned account kept posting, commenting,
  reacting, messaging, uploading, following, buying and renting for the whole ban window. The
  guard now sits after `JwtAuthGuard` (which populates `request.user`) and before `OwnershipGuard`
  on every authenticated mutating route, with two documented exceptions: the auth bootstrap and
  account self-service endpoints, where a ban is already refused at login and a mute must not
  lock a user out of verifying their own email. `restriction-route-coverage.spec.ts` drives the
  real `CommentsController` and `FollowsController` over HTTP — banned 403, muted 423 on the
  write and 200 on the read — because a unit test constructs the controller directly and guards
  never run.
- **`GET /reading-progress` answered 500 for every reader who had never opened a book.** The
  total query was `db.select({ count: readingProgress.id })` — the id column aliased as `count`,
  not an aggregate — so `[{ count }]` destructured the first row's UUID (`Number('<uuid>')` is
  `NaN`) and an empty result threw `TypeError` from the destructuring. The query is now `count()`,
  which returns exactly one row (zero for an empty set); the old mock in the suite had been
  handing back the row shape the buggy query never produced, which is why the suite stayed green
  while the endpoint 500'd. A new case pins the projection to an aggregate.

### Verification — this batch

| Gate | Result |
|---|---|
| Backend unit tests | 3614 passed / 170 files |
| Backend e2e | 199 tests: 194 passed, **5 pre-existing failures** (2 payments, 1 messages, 2 moderation) |
| `tsc --noEmit` (backend) | clean |
| `eslint src/ test/` (backend) | 0 errors, 0 warnings |

The five e2e failures reproduce identically on a pristine `HEAD` worktree with none of this
change set applied, and none are on a route these fixes touch: two are the `payment_status`
Postgres enum rejecting the `processing` value the repository has written since `cc7246d0` (the column
 drifted from `varchar` to a stale enum in the test database), one is a
stale `participant1` expectation against `getOrCreateConversation`'s response, and two are a 500
from `GET /moderation/stats`. They are recorded here rather than silently absorbed.

### Fixed — review findings from the same change set

An independent review of the batch above found one deploy-blocking defect and seven edge cases on the
money and entitlement paths. All eight are fixed here, and so are the seven non-blocking suggestions
the review raised.

- **The webhook wrote a status the database enum does not have.** `handlePaymobWebhook` recorded its
  transaction row with `status: status === 'completed' ? 'success' : status`, translating the
  normalised `completed` back into the gateway's word. `migrations/0024_create_database_enums.sql`
  makes `payment_transactions.status` the `payment_status` enum, and `success` is not one of its
  members — so on any migrated database the insert died (22P02) *after* the payment row had already
  been flipped to `completed` and *before* `payment.completed` was emitted: the webhook answered 500,
  no library row and no rental were ever granted, and the gateway's retry short-circuits at
  `already_processed`. The row now records the normalised `status` it already has.
- **An expired rental kept the paid book forever.** `assertReadAccess` returned on the mere existence
  of a library row, and nothing retires a lapsed rental on a clock — `checkAndExpireOverdue` has no
  caller and `rental.expired` is only published by a refund — so a `rented` row past its end date
  kept granting downloads indefinitely, and the stale row blocked the reader from buying or
  re-renting the book with a `ConflictException`. An `owned` row is a permanent entitlement and is
  trusted on its own; every other row is only as good as the rental it records, judged by the end
  date through `findActiveRentalForBook`. Pinned by two new cases: the stale `rented` row is refused,
  and an `owned` row still passes without a rental lookup.
- **A refund could revoke the wrong rental.** `findByUserAndBook` is `limit(1)` with no `ORDER BY`
  against a plain (non-unique) index, so a reader who rented, was refunded and rented again could
  resolve their *earlier* `returned`/`expired` row, take the "already ended, this is a replayed
  revocation" branch and return — leaving the refunded rental still `active` with its shelf entry
  intact. The query now returns the rental in force (`createdAt desc`), which is what both the
  access check and the refund path mean by "the rental".
- **Opening a book demoted its own entitlement.** `POST /library/:id/access` wrote
  `status: 'reading'` unconditionally, so a `rented` row opened once slipped past both of
  `BooksService.purchase`'s guards and was charged for a second time, while an `owned` row stopped
  being recognisable as owned. The access stamp is `lastAccessedAt`, which this route already
  writes; the status stays what the grant wrote.
- **The resend cooldown was a read-then-write check on a public route.** `POST
  /email-verification/resend-verification` is `@Public()`, and the cooldown was read, then armed
  after the mint and send — so N concurrent requests each passed the check and each delivered their
  own code. `ValkeyService.setIfAbsent` (`SET key value EX ttl NX`) now decides the race inside the
  store before the mint, the same atomic shape as `incrWithTtl`, and a failed mint releases the
  key — which preserves the reason the old ordering existed (a failed send must not lock the caller
  out for sixty seconds) without the race. The read-then-decide helper it replaced is gone.
- **A duration-less ban left no durable record.** `takeAction` gated its `user_restrictions` insert
  on `targetUserId && durationMinutes`, so a `ban` or `mute` issued without a duration was enforced
  only from the `restriction:<userId>` cache key (which the policy expires on a default) while the
  table an operator reads stayed empty — and once the key expired, no durable record remained. The
  gate now also fires for an account restriction with no duration, writing the row with the policy
  default expiry so the row and the cache key agree.
- **Rental withdrawal bypassed the service that owns removal.** `withdrawRentalAccess` re-implemented
  the delete and drifted from `LibraryService.removeFromLibrary` on its first side effect: the
  service also deletes the `library:<id>` cache key, so a returned or lapsed rental's shelf entry
  could keep being served from cache, and the copy emitted a second `library.item.removed`. It now
  goes through `removeBookForRefund`, the same path the refund consumer uses.
- **Public auth responses waited on the mail server.** `register` and `forgotPassword` awaited the
  SMTP send even though neither response depends on the delivery outcome — moving a mail-server
  stall (thirty-second socket timeout on a five-connection pool) onto two public, unauthenticated
  endpoints. Both sends are now deferred, and so is the one in the users verification flow, whose
  callers also never see the delivery outcome. `resend` still awaits, because its message is
  derived from the outcome.

### Fixed — the review's non-blocking suggestions

- The shared restriction reader made two Valkey round trips (`EXISTS` then `GET`) on every mutating
  request and every login, refresh and OAuth call, on the theory that the guard needed to see "key
  exists, value unreadable" separately. It receives the resolved value instead, and a single `GET`
  already returns `null` for both that state and the absent one — which is the guard's documented
  rule. One read now, and the comment says so.
- `handleRentalCreated` re-implemented `LibraryService.addToLibrary` — a second copy of the grant
  sequence, including its own `library.item.added` emit, injected into a handler that already
  injects the service. The grant now goes through the service; the handler keeps its two guards (a
  replayed rental is a log line, not an exception) and treats the service's `ConflictException` as
  the race those guards cannot see.
- `BooksService.incrementDownloadCount` had been dead since the download route moved to
  `recordDownload` — a second, unchecked door to the same repository write, kept alive by its own
  spec and by a mock in `books.service.spec.ts` still asserting `RentalsService.createRental`, the
  method the free-rental fix deleted. Both are gone; the rent test now asserts the checkout itself
  rather than the absence of a call to a method that no longer exists.
- `docs/api-contract/openapi/rest-api-spec.md` still advertised `POST /rentals` after the route was
  removed, and `docs/c4-model/component/module-boundaries.md` listed it in the rentals row. Both now
  describe the contract as it stands, with the reason recorded where a reader will look for it.
- The SMTP credentials the transactional transport needs existed in `.env.example` and the module
  README but in no deploy manifest — a chart upgrade with no mail server configured simply sends
  nothing, silently. The Terraform `secrets` module now owns `email/host`, `email/port`, `email/user`
  and `email/password` under each environment's prefix (with the variables declared and the
  per-environment tfvars entries following the paymob convention: injected at apply time, empty means
  "this environment sends no mail"), the chart's ExternalSecret syncs all four keys, the Deployment
  mounts them, and `EMAIL_PROVIDER` rides in the ConfigMap as the one non-secret knob.
- The content-removal consumers filtered on hard-coded `'story'` / `'comment'` literals while the
  producer decides from `CONTENT_BEARING_TARGET_TYPES`, so a rename in the DTO would have turned
  every removal into a silent no-op with no test noticing. `moderation-content-removal.coverage.spec.ts`
  now reads both sides and fails when the vocabulary and the consumers drift apart — the
  consumer-side counterpart of `REGISTERED_WITHOUT_PRODUCER`.
- `restriction-route-coverage.spec.ts` registered a probe controller it never requested; the muted
  case now exercises an authenticated read through it alongside the public one, so the
  "muted accounts keep reading" promise is proven on both shapes.

### Verification — the review fixes

| Gate | Result |
|---|---|
| Backend unit tests | 3619 passed / 171 files |
| Backend e2e | 199 tests: 194 passed, **the same 5 pre-existing failures** as pristine `HEAD` |
| `tsc --noEmit` (backend) | clean |
| `eslint src/ test/` (backend) | 0 errors, 0 warnings |
| Helm chart | `EMAIL_*` added to ConfigMap/ExternalSecret/Deployment (not rendered here — `helm` is not installed in this environment) |

### Verification

| Gate | Result |
|---|---|
| Backend tests | 2918 passed / 139 files |
| Frontend tests | 340 passed / 21 files |
| `tsc --noEmit` (backend, frontend, shared-types) | clean |
| `eslint src/ test/ e2e/` | 0 errors |
| `prettier --check` | clean |
| `npm run db:check` | pass, 2 documented warnings |
| `npm audit --omit=dev` | 0 vulnerabilities |
