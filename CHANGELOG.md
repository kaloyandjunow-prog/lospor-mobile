# Changelog - LOSPOR Mobile

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
