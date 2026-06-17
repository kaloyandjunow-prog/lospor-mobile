# Changelog — LOSPOR Mobile

All notable changes to the Expo mobile companion app are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.1.1] - 2026-06-17

### Fixed
- **Offline intraoperative events are no longer lost on a transient sign-in expiry.** A `401` while replaying queued events now keeps them for retry after you sign in again, instead of discarding them. Events the server permanently rejects (invalid, finalised, or deleted case) are recorded for visibility rather than silently dropped.

### Changed
- Android `versionCode` bumped to 3.

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
