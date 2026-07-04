@AGENTS.md

# LOSPOR Mobile Memory

## Shared core package

- `@lospor/core` (shared pure-TS clinical logic) lives at github.com/kaloyandjunow-prog/lospor-core and is consumed as a git dependency pinned to a tag (see package.json).
- To change core logic: edit `C:\LOSAR\lospor-core` → commit → push → tag a new version → bump the tag in this repo's package.json AND lospor-app's → `npm install` in both → run both test suites.
- Metro resolves the package from node_modules; no watchFolders entry is needed.

## Role

- This is the Expo/React Native clinician app.
- It should have practical feature parity with the web app, but mobile UX must be faster and more clinical-task-focused than the web forms.
- Design target: tired anesthesiologist at 2am who needs to document vitals/drugs/events quickly with minimal reading and minimal taps.

## Recent Roadmap Implemented

- Added/expanded case sync helpers:
  - API auth expiry handling in `src/lib/api.ts` and auth context.
  - Offline patch queue in `src/lib/offline-case-patches.ts`.
  - Queued-save flusher in `src/lib/use-queued-save-flusher.ts`.
  - Live refresh helpers in `src/lib/use-live-refresh.ts` and `src/lib/use-case-live-updates.ts`.
- Preop/postop save flows now use canonical web API field names, queue offline saves, and expose saved/queued/conflict/error states.
- Mobile case detail gained web-parity actions including share summary, printable protocol, edit preop/intraop/postop, AI advisor, handover, finalise, and delete.
- Added audit log screen at `app/(app)/audit-logs.tsx`.
- Added admin screen at `app/(app)/admin.tsx` for pending registrations, HOD requests, and roles.
- Added language/theme preference provider in `src/lib/preferences-context.tsx`.
- Added shared theme palette in `src/theme/colors.ts` and moved many general screens onto it.
- Dashboard now defaults to all accessible cases, has a compact clinical toolbar, clickable stats, and a visible horizontal scope rail.
- Mobile preop new flow now uses one scrollable section form with:
  - universal `AppHeader`;
  - sticky secondary section rail for Patient, Case details, Medical History, Current Meds, Anamnesis, Physical Exam, Airway, Labs, and Risk;
  - auto-centering active section pill;
  - primary header collapse on vertical scroll;
  - right-side section scroll rail that appears while scrolling.
- Keep the universal app header across app screens. In preop/intraop/postop/summary, hide the New Case button but keep Home and Settings.
- `src/components/ClinicalNumberInput.tsx` is the shared numeric entry pattern for non-vital clinical numbers outside intraop drug dosing. It accepts comma/dot decimals and avoids `NaN`.
- `ClinicalNumberInput` uses an anchored iOS-alarm-style wheel that appears from the tapped field and saves on outside tap. It also has a custom in-app `123` keypad option, not the OS numpad.
- Weight wheel behavior is intentionally non-uniform: 0.5 kg increments only up to 20 kg, then whole-kilo increments after 20 kg.
- Do not use the wheel for preop vitals. SBP, DBP, HR, SpO2, temperature, and respiratory rate use the mobile `VitalStepper` in `app/(app)/cases/new.tsx`: web-like `- / number / +`, hold-to-repeat buttons, thin slider, and custom keypad when the number is tapped.
- Search fields use inline dropdown autocomplete via `src/components/SearchTagInput.tsx`, not full-screen modals/page sheets.
- Procedure autocomplete displays the web endpoint shape like the web app: primary label is `group`; supporting text is `code · domain`. Do not switch it back to raw PCS `description` as the primary mobile label.
- The preop Case details section no longer includes Surgeon, Anesthesiologist, or Anaesthesia nurse fields.
- `src/components/LabScanPanel.tsx` adds mobile camera/gallery lab scanning through the existing web Mistral lab extraction API, with review-before-import.
- Medication/search chips use stable keys to avoid duplicate-label warnings from drug search results.

## Intraop Direction

- The intraop timetable should stay a specialized high-speed clinical surface.
- Best direction is a scrollable/zoomable connected timeline with 5-minute rhythm, now marker, vitals lane, drugs lane, fluids/output lane, airway/events lane, and fast thumb actions.
- Avoid generic stacked form UI for intraop documentation.
- Keep the screen optimized for rapid entry: one-tap common actions, sticky now controls, large touch targets, clear recent entries, and immediate visual confirmation.
- Some hardcoded dark clinical colors remain in intraop intentionally; do not blindly convert them to the global palette without a focused redesign.
- Intraop sections support horizontal swipe navigation and the active tab is centred in the rail.
- Automatic vitals must be persisted as `vital` events through `/api/cases/[id]/events`; never implement them as timetable-only local state.
- Mobile gas entry uses shared `VitalStepper` controls: FGF 0-100 L/min, O2 plus exclusive Air/N2O, and FiO2 0-100%.
- Ventilation mode toggles must derive selection from the functional state updater to avoid rapid-tap stale-state bugs.
- Postop recovery uses the shared vital controls for SBP, DBP, HR, SpO2, and temperature. Time in PACU is removed.

## Design System Notes

- General app screens should use `src/theme/colors.ts` instead of hardcoded `#111111`, slate, or blue values.
- Buttons/cards should feel clinical and premium: strong hierarchy, compact spacing, good contrast, subtle borders, and no decorative clutter.
- Settings, dashboard, admin, audit logs, and case detail have partial translation/theme coverage.
- Deep clinical form labels are still mostly English; treat full localization as a separate pass.

## Verification

- Run `npx tsc --noEmit --pretty false` after changes.
- For visual changes, prefer an Expo/device walkthrough after typecheck, especially for intraop, admin, and case detail.
