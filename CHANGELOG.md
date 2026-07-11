# Changelog - LOSPOR Mobile

## [5.0.0] - 2026-07-11

Unified save/sync engine. Android `versionCode` 19 (JS-only, no native changes). Not yet released — local build only.

### Changed
- **All save/offline/conflict logic now runs on one shared engine** (`@lospor/core/sync`), used identically by mobile and web. The offline patch queue, pending intraop-event journal, per-case write queue, and 409 self-heal are one tested implementation instead of parallel copies — a fix in one place now reaches both apps. Storage keys and screen behavior are unchanged; queued data on devices survives the upgrade.
- **Preop and postop saves are now field-level.** Autosaves send only the fields that changed since the last confirmed save, so two clinicians editing *different* fields of the same case no longer overwrite each other, and unchanged autosaves skip the network entirely. Manual submit still sends the complete record as the convergence point.

### Fixed
- A latent race in the offline queue's index bookkeeping (two flushes running at once could silently lose a queue entry) — index updates are now serialized in the shared engine.

## [4.1.6] - 2026-07-11

Intraop autosave race fix. Android `versionCode` 18 (JS-only, no native changes).

### Fixed
- **Overlapping intraop autosaves no longer race or clobber each other.** Every event write for a case now goes through a per-case single-flight queue, so saves that previously fired concurrently — rapid vitals/drug/event entry, or a live refresh landing mid-save — run one at a time instead of colliding and overwriting each other.
- **A stale-timestamp conflict on the full-log save now self-heals.** The full intraop-log save (`PUT /api/cases/[id]/events`) retries once on a `409` using the server's returned `updatedAt`, instead of leaving the save stuck in a failed state that needed a manual "Sync retry".

## [4.1.5] - 2026-07-05

Android `versionCode` 17.

### Fixed
- Replaced the corrupted preop section-overview floating button text with a real app icon, fixing the mojibake shown in mobile and Expo PWA builds.
- Normalized the Expo web manifest description so PWA install metadata avoids fragile glyph encoding.

## [4.1.4] - 2026-07-05

Intraop bug fixes (regressions surfaced after the shared-core refactor). Android `versionCode` 16 (JS-only, no native changes).

### Fixed
- **Airway devices with sub-panels (LMA / oral & nasal ETT / DLT / endobronchial) can be re-edited again.** Reopening a confirmed device to edit it left the panel unable to auto-collapse (a "was complete on open" flag that was never reset). Reopening an already-added device now clears its sub-fields so it opens deselected and re-picks from scratch, identical to first-time entry — and collapses again on completion.
- **Changing an infusion's rate now splits the bar at the column you're editing, not the whole case.** The manage/rate sheet had lost the tapped-column context in the shared-core refactor, so the rate change was stamped at wall-clock "now" instead of the column being edited. The rate change now anchors to the tapped column (v3.5.0 behavior restored); e.g. starting Propofol 4 mg/kg/hr at 12:00 and changing to 6 at 13:00 now correctly shows 4 from 12:00–13:00 and 6 from 13:00 on.
- **Adding vitals no longer fails and requires a manual "Sync retry".** On a case that had been touched on the web app, the first event save does a full-log migration PUT with a conflict header; if the client's base timestamp was stale it 409'd and stuck in "failed". The single-event save path now self-heals a 409 once with the server's timestamp (mirroring the whole-log sync path), so the first vitals of such a case save automatically.

### Changed
- **Adding or ending a fluid no longer fires a second, redundant save.** Every fluid change used to also recompute the fluid totals and PATCH them separately — an extra request that always lost a conflict race and retried (three round-trips per fluid change, and the "multiple autosave rolls" in the sync badge). The server now derives fluid totals from the fluid events themselves, so the app just records the fluid event and the totals follow — one save per fluid action.

## [4.1.3] - 2026-07-05

Version alignment across all four LOSPOR repos (core, app, mobile, docs) — no functional changes beyond v4.1.2. Android `versionCode` 16 (no native changes).

## [4.1.2] - 2026-07-05

Sync-race and correctness fixes in the intraop timetable, following a live incident where the backend's database connection pool was exhausted (see lospor-app v4.1.2) and made these worse. Android `versionCode` 16 (no native changes this round, JS-only fixes).

### Fixed
- **Stopping an infusion/agent/fluid, and changing rate, no longer feel stuck behind unrelated network activity.** v4.1.1 fixed a lost-update race in the local offline pending-events cache by routing it through the same single-flight queue used for network saves — but that queue is a strict FIFO, so every local bookkeeping step then had to wait behind whatever network call was currently in flight (worse under the connection-pool exhaustion above). Local storage now has its own dedicated queue, decoupled from network latency.
- **Ending a case with multiple active infusions/agents/fluids is faster.** The end-case confirmation stopped each active item one full round-trip at a time; they now stop concurrently.
- **Changing a volatile agent's percentage no longer truncates its timeline bar.** There's no dedicated "agent rate change" event (unlike infusions, which have one) — adjusting percent on an already-running agent re-fires a plain start event, and the timetable projection was treating that as a full restart, cutting the bar's visible history back to the adjustment point. It now recognizes a same-agent restart and keeps the original start column.
- **Adding vitals now closes the entry sheet immediately**, matching how adding a drug, infusion, or fluid already worked — previously it waited for the full network save to finish before dismissing, making vitals entry feel uniquely slow.
- CI (`npm ci`) lockfile version drift fixed (see lospor-app v4.1.2 for the root cause — regenerated to prevent the same class of issue here, even though this repo's own CI hadn't hit it yet).

## [4.1.1] - 2026-07-05

Bug-fix follow-up to v4.1.0. Android `versionCode` 16 (no native changes this round, JS-only fixes).

### Fixed
- **Airway device / vascular access / premedication selections no longer flicker and revert.** The initial case-load GET could clobber a just-made selection with the pre-edit server snapshot before an in-flight autosave committed; the existing in-flight-save guard (already protecting techniques/positions/monitoring) was never extended to these fields.
- **Rapid drug/event entry in the intraop timetable no longer silently drops items.** The local offline pending-events cache did an unguarded read-modify-write on every add/remove; tapping 2-3 items within ~1-2 seconds could race and lose one from the offline safety net. Now serialized through the same single-flight queue already used for network saves.
- **Preop data (age, height, weight, diagnosis, comorbidities, etc.) no longer silently lost on close/reopen.** Two causes: the debounced autosave was cancelled (not flushed) on navigating away within its 2s window, and reopening a case could race a still-unflushed queued offline patch, showing stale server data in the meantime. Autosave now flushes on unmount, and reopening a case first attempts to flush any queued patch before fetching.
- **Account deletion wording no longer overpromises (Bulgarian).** The Bulgarian confirmation text claimed the action "permanently deletes your profile and all related data" — stronger than what actually happens (disable + token revoke, deletion/anonymisation per retention policy). Wording now matches the accurate English text.
- Residual encoding corruption (mojibake) cleaned up in 10 files — bullets, arrows, middle dots, ellipses, and a garbled "SpO₂"/"EtCO₂" in a test file; earlier fixes this release cycle were incomplete, not a full sweep.

## [4.1.0] - 2026-07-05

Full Bulgarian localization pass and shared clinical-data consolidation. Android `versionCode` 16.

### Added
- **Deep Bulgarian translation coverage** across the intraop screen (vitals, airway, vascular access, timing, drug/infusion pickers, timetable row/footer/undo bar, monitor header), preop, case-detail cards, dashboard, settings, and admin/audit-logs.
- Base and clinical UI strings extracted into `src/i18n/strings.ts` and `src/i18n/clinical-strings.ts`, with an automated English/Bulgarian key-parity test so the two languages can no longer silently drift apart.
- Ventilation-mode lists, the complications picker's category list, and case-status label text now come from `@lospor/core` instead of hand-duplicated local copies, shared with the web app.

### Fixed
- Repaired broken characters (UTF-8/cp1251 mojibake) found in postop handover items and several case-detail card files while translating them.
- **Registration now sends a normalized email** (trimmed + lowercased), matching the login and forgot-password screens; the API helpers normalize defensively as well. The server (lospor-app 4.1.0) normalizes all auth emails authoritatively.
- Repaired broken characters (UTF-8/cp1251 mojibake) in `docs/play-store-data-safety.md` and `RELEASE_PLAN.md`.

## [4.0.0] - 2026-07-03

Quality/stability milestone. The intraop screen was rebuilt internally (same UX, far more maintainable and faster), account email flows arrived, and the mobile test suite grew from 95 to 228 tests.

### Added
- **Forgot password** screen; register/login now use shared auth API helpers (`registerAccount`, `requestPasswordReset`, `confirmPasswordReset`).
- **Single-flight event save queue**: event POSTs, whole-log syncs, retries, and live-refresh reloads are serialized so fast sequences like "start infusion → immediately Undo" no longer produce transient "Sync error" badges. Full-log sync also retries once with the server timestamp after a 409 (e.g. when a fluid-total autosave races an undo/delete).
- **Timetable performance pass**: per-column row data memoized, `React.memo` rows (the moving now-marker only invalidates the current row), batched running-item projection, tuned FlatList batching, press feedback restored via `FeedbackPressable`.
- **In-app medical disclaimer** and crypto-backed event IDs.
- **Shared `@lospor/core` package** for dosing, scores, unit conversion, ranges, equipment suggestions, option-library mappers, and timetable math — one source of truth with the web app.
- Offline hardening: cached empty option-library categories fall back to the bundled library instead of blanking clinical menus.

### Changed
- **Registration success screen** now says to verify your email — admin approval no longer gates login (see web 4.0.0 notes).
- **Intraop route refactor**: `cases/intraop/[id].tsx` went from 4,073 to ~650 lines. Logic moved to ~40 unit-tested `src/lib` modules (projection, running items, event edit/actions, lifecycle, monitoring defaults, premedication, airway, timing, pending-event queue…) and the UI to ~25 focused components (tab hosts, sheet hosts, timetable rows, monitor header…). Behaviour-preserving; verified on device.
- **Preop route refactor**: `cases/new.tsx` from 2,220 to ~1,180 lines (schema, section overview, server value/create/patch mappers, ASA suggestion, validation navigation, form widgets extracted). Preop autosave now serializes with in-flight saves; age accepts up to 149; airway wheel values (mouth opening ≤10 cm, thyromental ≤15 cm) no longer fail validation.
- Case detail and postop screens split into card/section components.

> Note: versions 3.4.x–3.5.0 shipped as combined web+mobile releases; their detailed notes live in the web app changelog.

## [3.3.0] - 2026-06-27

### Fixed
- Allergy details on the case summary now displays drug names (e.g. "Analgin") instead of raw JSON (`[{"label":"Analgin",...}]`). Parsing matches the existing behaviour for current medications.

### UX
- Case detail action area redesigned from a scrollable horizontal pill row into a structured review bar. The bar shows the case status, inline edit shortcuts (Preop / Intraop / Postop), a prominent Finalise Now button for non-COMPLETE cases, Print PDF, Unfinalize (when COMPLETE), and Delete. All previous actions are preserved.
- Print PDF now uses a dedicated `handlePrint` function (print token + browser open) extracted from the old inline handler, making it callable independently of finalization state.

## [3.2.2] - 2026-06-27

### Fixed
- Drug dose stepper now shows decimal digits for drugs with fractional step sizes (e.g. Atropine 0.5 mg steps now display "0.5", "1", "1.5" instead of "1", "2"). `DoseSelector` now auto-derives display precision from the step value when the caller doesn't supply one explicitly.
- Selecting a drug from the drug sheet no longer auto-fills the first quick-dose pill. Dose field starts empty so the anesthesiologist can deliberately choose from the quick pills or use the stepper before confirming.
- End case modal now shows the finalise button even when there are no active running items (no agent, fluid, infusion, or gas). The previous `&&` guard kept the button hidden whenever the item list was empty, making it impossible to end the case in a clean session.

## [3.2.1] - 2026-06-27

### Fixed
- Server-side relational-sync now uses sequential writes instead of `$transaction([...])`, eliminating P2028 errors that appeared in Vercel logs after every case save (background mirror only; case data was always saved correctly). No client change.

## [3.2.0] - 2026-06-27

### Changed
- Finalise action now calls `POST /api/cases/:id/finalize` instead of `PATCH` with `{ status: "COMPLETE" }`. The new endpoint validates preop/intraop/postop completeness before committing.
- Case creation now sends `X-Idempotency-Key: <localDraftId>` on the POST request so offline drafts that lose their response are not duplicated on retry.

### Fixed
- Drug allergy autosave from PWA was rejected by the server PII filter when a drug name contained two capitalised words (e.g. "Morphine Sulfate"). Fixed server-side; no client change required.
- Intraoperative event and case autosave returned 500 errors under load due to a Prisma transaction timeout (P2028). Fixed server-side by replacing the interactive transaction with sequential writes.

## [3.1.0-hotfix] - 2026-06-27

### Fixed
- PWA login was blocked with 403 after the v3.1.0 CSRF hardening incorrectly applied the origin check to `/api/auth/token`. Fixed server-side; no client change required.

## [3.1.0] - 2026-06-25

### Security and privacy hardening
- Version metadata aligned to `3.1.0`.
- Failed login now uses a generic message instead of probing the server for pending-account state.
- Logout clears local clinical drafts, queued case patches, and queued intraoperative events before removing the token.
- PWA storage notes now state that browser `localStorage` is weaker than native secure storage.
- Account deletion copy now matches the implemented soft-delete/access-disable behavior instead of promising automatic hard deletion.

### Intraoperative cockpit polish
- Bolus drug and infusion pickers now open through scenario-based 2-column cockpit menus instead of exposing raw catalogue groups first.
- Synced user favourites for bolus drugs and infusions can be managed from Settings and appear as the first picker action.
- Browse-all remains available with search and canonical library grouping/listing.
- Route-specific dose profiles are respected on mobile/PWA: IV lidocaine stays a dose entry, while local/PD/IT/peripheral block routes show concentration/volume controls.
- Starting a bolus drug as an infusion now preloads the same canonical quick-rate default as selecting that infusion directly.

## [3.0.0] - 2026-06-25

### Summary
- Promotes the accumulated mobile work to **v3.0.0** and aligns with the web/API v3.0 canonical data contract.
- App metadata now uses Expo `version: 3.0.0`; Android `versionCode` is `10`; package metadata is `3.0.0`.

### Added - Mobile/web parity
- Mobile now maps payloads to canonical web/API field names before saving, instead of behaving like an independent schema.
- Case detail actions now cover the web-parity surfaces: printable protocol, share summary, audit logs, admin console, handover, postop, AI advisor, and intraop timetable.
- Dashboard scopes and statistics now match the web defaults and filter behavior.
- Live refresh and queued-save states make web-side changes visible on mobile and mobile-side changes visible on web.

### Added - Offline-safe shared libraries
- Intraop option lists now come from the shared web `OptionLibrary` endpoint: positions, techniques, airway management, ventilation, monitoring, premedication, bolus drugs, infusions, inhalational agents, fluids, clinical events, handover items, numeric ranges, and postop/preop pickers.
- First-install/offline fallback uses a bundled option-library snapshot; cached/bundled data is visible through an offline-library banner and refreshes automatically when the live API is reachable.
- EAS and PWA export can fetch the fallback snapshot from the protected web endpoint before build.

### Changed - Preop UX and canonical data
- Preop entry was rebuilt into a section-based mobile form with universal app header, sticky section rail, side scroll rail, inline autocomplete, and context-specific clinical number entry.
- Diagnosis and comorbidity search use the shared Bulgarian/English ICD-10 API and store code-first tags with both labels.
- Procedure search uses the shared API and displays the web/API `group` as the primary label.
- AI lab scan uses the same canonical lab catalogue, canonical units, LOINC mappings, and normal ranges as web.
- Medication allergy saves as `Medication.kind = ALLERGY`; deselecting the allergy boolean clears the associated text/row state.
- Difficult-airway notes, team notes, physical exam report, and event complication notes are limited to 500 characters and cleared when disabled.

### Changed - Intraop timetable
- Drug, infusion, fluid, agent, event, vitals, glucose, and gas entries use the shared canonical library metadata and event API.
- Fresh gas flow has its own entry path and timeline lane; FiO2 is clamped to 21-100%, O2-only is represented as FiO2 100%, and Air/N2O fractions are calculated and persisted.
- Running infusion, fluid, agent, and gas lanes extend after reopening a live case instead of freezing at last save.
- General inhalational anaesthesia auto-selects SpO2, NBP, ECG, temperature, and EtCO2 monitoring.
- Serum/peripheral glucose is available as a timed intraop vital with canonical `mmol/L` and LOINC `2345-7` on the backend.

### Reliability and tooling
- Offline case-section saves queue and flush safely; intraop events retain idempotent queued replay behavior.
- Added baseline ESLint, TypeScript typecheck, and Vitest test suites for mobile logic/components.
- Cleared current lint errors/warnings targeted during the v3.0 pass.

---
All notable changes to the Expo mobile companion app are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.3.0] — 2026-06-20

### Changed
- Version aligned to **2.3.0** (Android `versionCode` 9).
- Intraop option lists (positions, technique tree, airway management/instruments, monitoring, premedication drugs, intraop drugs, infusions, inhalational agents, fluids, clinical events) now come from the shared `OptionLibrary` API instead of being hardcoded separately in `IntraopTimetable.tsx` and the intraop case screen — this fixes a real drift where those two mobile surfaces had different drug/infusion/fluid lists from each other, and where mobile's technique codes didn't match web's for the same techniques.
- Monitoring now uses a genuine `respiratory` group (capnography, temperature) shared with web, instead of a mobile-only distinction the web app didn't have.
- Mobile's airway instrument list grew from 6 to 8 options (now matches web's full set automatically, since both read the same library).
- `offline-case-patches.ts`: 401 handling during a flush is now explicit and documented (patches were already correctly preserved on auth expiry, just not clearly so); idempotency keys were evaluated but intentionally not added here — unlike the events queue, a case-section PATCH naturally converges to the same result on retry, so a dedup key isn't needed the same way.

### Added — Offline-safe option library
- The app now falls back to a snapshot of the option library bundled into the app itself if a device has never successfully synced and has no SecureStore cache either (first install + no connectivity) — previously this showed silently empty pickers with no fallback at all.
- A visible banner appears in the app header whenever any picker is running on cached or bundled (non-live) data, so a clinician never silently trusts a list without knowing it might be stale; a background retry every 30s swaps in live data the moment connectivity returns, no restart needed.
- The bundled snapshot (`src/data/option-library-fallback.json`) is now fetched automatically from `lospor-app`'s shared-secret-protected snapshot endpoint via the `eas-build-pre-install` lifecycle hook (`scripts/fetch-fallback-snapshot.mjs`) before every EAS build and before `npm run export:web` — requires `EXPO_PUBLIC_API_BASE` and `OPTION_LIBRARY_SNAPSHOT_SECRET` set as EAS secrets (see `lospor-app/docs/post-migration-seeds.md`); without them, the hook logs a warning and keeps whatever snapshot is already committed, rather than failing the build.

### Changed — Code quality
- `IntraopTimetable.tsx` and the intraop case screen no longer populate option-library data by mutating module-level arrays inside `useMemo`. Every category (drugs, infusions, fluids, agents, clinical events, positions, monitoring, technique tree, airway, premedication) is now a plain `useMemo`-derived value scoped to the component itself, removing the only place in this codebase doing side effects inside `useMemo`. Two dead helper functions (`findTechNode`, and web's equivalent `labelFor`) were found and removed along the way.

### Fixed
- A case closed mid-infusion (or mid-fluid, mid-agent) and reopened later now shows the running bar correctly extended to the current time, instead of frozen wherever it was at the last save — the same backend fix web got, since both apps load a case through the same endpoint.
- `package-lock.json` was still pinned at `2.1.1` despite `package.json` reading `2.3.0`.

## [2.1.1] — 2026-06-19

### Changed
- Version aligned to **2.1.1** (Android `versionCode` 8).
- Bulgarian ICD-10 diagnosis and comorbidity search now uses the shared language-aware API path and stores code-first tags with English/Bulgarian label snapshots.
- Added a Settings control to clear local clinical cache: offline drafts, queued preop/postop saves, pending intraoperative event queues, and dropped-event recovery logs.
- Settings/About now reports the current 2.1.1 release line.
- Privacy posture aligned with the web app: local offline data is explicit and user-clearable.

## [1.2.0] - 2026-06-18

### Changed
- Version aligned to **1.2.0** (Android `versionCode` 5). The v1.2 work — storing
  clinical data as queryable database rows — is entirely server-side; the app sends
  the same data and behaves identically, so there is no functional change here.

---

## [1.1.1] - 2026-06-17

### Fixed
- **Offline intraoperative events are no longer lost on a transient sign-in expiry.** A `401` while replaying queued events now keeps them for retry after you sign in again, instead of discarding them. Events the server permanently rejects (invalid, finalised, or deleted case) are recorded for visibility rather than silently dropped.
- **Unfinalize ("undo finalise") now works** — the button called the wrong HTTP method (`PATCH`) for the server, which only accepts `POST`. It now uses `POST`.

### Changed
- Android `versionCode` bumped to 4.

---

## [1.1.0] - 2026-06-15

### Added
- **Case reminders (notifications)** — opt-in reminders during an active case. When enabled, you get a "vitals due" reminder every few minutes that resets whenever you chart a set of vitals. Settings → Notifications has a toggle, an interval picker (3/5/10/15 min), a live permission-status line, and a "Send test notification" button. Native uses on-device scheduled notifications (fire even when backgrounded); the PWA uses browser notifications over HTTPS.

### Changed
- **Offline intraoperative events** now replay automatically when the connection returns (idempotency-keyed, so nothing is duplicated or lost), not only while the case screen is open.
- **Sign out** now revokes the session on the server, so a token can't be reused after logout.
- Offline "saved/discarded" sync counts are reported accurately.

### Fixed
- Infusion rate changes now show the correct rate for each time slot on the running-infusion pill (previously it kept showing the starting rate).

---

## [1.0.0-hotfix2] - 2026-06-12

### Changed
- Aligned the PWA/native registration flow with the web app by adding country selection, country-aware institution handling, password confirmation, and the full production password policy.
- Standardized registration consent on the backend-compatible `acceptedTerms` field.

### Fixed
- PWA/native account creation no longer fails with `Invalid input: expected boolean, received undefined` after accepting the Terms of Use and Privacy Policy.
- Anchored development screenshot ignore patterns to the repository root so EAS Build includes the adaptive Android icon assets during prebuild.

---

## [1.0.1] — 2026-06-09

### Added
- Swipe navigation across intraoperative sections with automatic active-tab centring.
- Persisted five-minute automatic vital events, including optional BP/HR carry-forward and background gap filling.
- FGF 0-100 L/min and FiO2 0-100% controls using the shared slider/stepper/custom-keypad input.
- O2 plus mutually exclusive Air/N2O carrier-gas selection.
- Stop or Continue postop decisions for every running volatile agent, infusion, and fluid at case end.
- Recovery SBP, DBP, HR, SpO2, and temperature controls with preop-style random initial values.

### Changed
- Technique pills now include category context.
- Ventilation mode families provide immediate feedback and switch cleanly between assisted and controlled modes.
- Mobile case summaries display current gas settings and recovery vitals.

### Removed
- Time in PACU from the postoperative workflow.

### Fixed
- Automatic vitals now reach the shared event log and web app instead of disappearing during timetable reconstruction.
- Rapid VCV/PCV and Assisted/Controlled selection no longer relies on stale rendered state.

---

## [1.0.0] — 2026-05-26

### Added

#### Authentication
- Login screen with email + password; JWT stored in `expo-secure-store`
- Automatic Bearer token injection on all API requests via `apiFetch()`
- Auth expiry detection: token refresh or sign-out prompt on 401 responses
- Secure device ID generation (stored in SecureStore with `mob-` prefix) for case presence locking

#### Dashboard
- Dashboard now defaults to **All cases**, newest first, matching the web app and showing the full accessible history
- Clinical toolbar with dashboard, new case, and settings actions
- Clickable stat cards and visible horizontal scope rail for All, Today, Month, Active, Drafts, Awaiting Postop, Complete, and Handovers
- Floating **New case** action is labelled so it is no longer an ambiguous plus-only button
- Case list with status badges (Draft / In Progress / Complete) and last-updated timestamp
- Floating action button → New case
- Pull-to-refresh

#### New Case — Preoperative Form
- Preop section dashboard summary for Patient, Case, Meds & Safety, Airway, Vitals, Risk, and Labs completion; tapping a section opens a focused editor instead of the old endless scroll
- Shared clinical number input for age, height, weight, mouth opening, thyromental distance, and other numeric clinical fields
- Decimal parsing accepts comma and dot input without saving `NaN`
- Camera/gallery AI lab scan using the web Mistral extraction endpoint, with review-before-import
- Drug/medication search results use stable keys even when duplicate labels are returned
- Form validation now reports missing fields instead of jumping back to the top on submit
- Demographics: age, sex, height, weight, blood type, Rh factor
- Live BMI, IBW (Devine formula), and ABW badges displayed alongside the weight field
- ICD-10 diagnosis and procedure tagging with search
- Comorbidities search and tag
- Allergies (allergen search + latex flag)
- Current medications search and tag
- Family anaesthesia problems flag with free-text notes
- Dental flags: prosthetics, loose teeth
- Airway feature flags: retrognathia, prominent incisors, facial hair
- Habits: smoking, substance abuse
- RCRI checkbox panel (5 factors + high-risk surgery) with live score and risk label (Very low / Low / Moderate / High)
- APFEL checkbox panel with live score and risk label (Low / Moderate / High)
- STOP-BANG checkbox panel with live score and risk label (Low / Intermediate / High)
- Airway assessment: Mallampati (I–IV with description hints), mouth opening, thyromental distance, neck mobility, Upper Lip Bite Test (with ULBT hints), Cormack-Lehane grade (with description hints), difficult airway history and notes
- **Unable to Obtain** toggle for the entire airway block — collapses all airway fields
- Vitals: BP systolic/diastolic, heart rate, SpO₂, temperature, respiratory rate
- **Unable to Obtain** toggle for the entire vitals block — collapses all vitals fields
- Lab results with searchable panel and value entry
- ASA classification (I–VI) with emergency flag
- Form validation scrolls to the top and highlights the first failing field on submit

#### Case Detail (Summary)
- Full clinical detail for all three sections (preop, intraop, postop)
- Creation date and case code in header
- Airway risk flags computed from boolean fields (difficult airway history, Mallampati III–IV, CL grade III–IV, retrognathia, prominent incisors, facial hair, ULBT Class III)
- Dedicated intraop complications section
- Action buttons: Edit preop, Edit intraop, Edit postop, Share summary, Printable protocol, AI advisor, Handover, Finalise, Delete case
- Audit log navigation shortcut

#### Edit Case (Preop)
- Pre-fills all fields from the API response
- PATCH on save with conflict detection (updatedAt header)
- Presence lock: entering the form acquires the lock; watching mode disables the save button

#### Intraop Screen
- Premedication entry: evening and morning fields with quick-select chip rows (10 common premeds each)
- Complications picker: 6 complication categories (Airway, Cardiovascular, Respiratory, Neurological, Metabolic/Other, Regional) with multi-select items per group and free-text addition; saved via PATCH
- Presence lock: form acquires lock on mount; watching mode shows amber overlay with "Take over" button; all action bar buttons exit early when watching

#### Postop Screen
- Grouped handover checklist: 8 groups (Airway, Breathing, Circulation, Neurology, Pain, Fluids, Safety & Environment, Handover Communication) with 31 checklist items total
- Collapsible accordion per group; all groups start expanded
- Checked/total counter per group header; green border when all items in group are checked
- Presence lock: watching mode disables the save button

#### Case Presence Lock (all edit screens)
- Device ID stored in SecureStore (`mob-<uuid>` prefix)
- Lock acquired on screen mount, refreshed by 15-second heartbeat, released on screen unmount
- `AppState` listener: heartbeat paused when app moves to background, lock reacquired when app returns to foreground
- `WatchingOverlay` component: amber banner with "Take over" button, rendered above all content
- Fail-open: network errors never block editing

#### Admin Screen
- Pending registration approvals (approve / reject)
- Head of Department requests
- User role management

#### Audit Log Screen
- Paginated audit event list
- Action-type filter

#### Settings
- Sign out
- Language preference (English / Bulgarian)
- Theme preference (Light / Dark / System)

#### Infrastructure
- Offline patch queue: failed saves are queued locally and flushed when connectivity is restored (`src/lib/offline-case-patches.ts`)
- Queued-save flusher on app resume (`src/lib/use-queued-save-flusher.ts`)
- Live case refresh: polling / SSE fallback so the mobile app reflects web-side changes in near-real time (`src/lib/use-live-refresh.ts`, `src/lib/use-case-live-updates.ts`)
- Shared colour palette in `src/theme/colors.ts` — all general screens use this; intraop retains a specialised dark clinical palette
- Language and theme preference context provider (`src/lib/preferences-context.tsx`)

### Fixed
- `Haptics.notificationAsync` crash on Android (dev builds without full native linking) — error silently ignored, save completes normally
- Scroll-to-top on validation failure in the preop form
