# LOSPOR Mobile v3.0.0 Release Plan

> **Historical base checklist.** This file started as the original mobile launch checklist and is now superseded by the v3.0.0 release process. See `CHANGELOG.md` for the release history and `app.json` for current store metadata.

Status legend: ⬜ pending В· 🔄 in progress В· ✅ done

---

## Phase 1 — Git repository

- ⬜ Add `.expo-static-check/` to .gitignore
- ⬜ Rename branch master → main
- ⬜ Stage and commit all changes (include `patches/`, exclude `.expo-static-check/` and `dist/`)
- ⬜ Tag v3.0.0
- ⬜ Create GitHub repo `kaloyandjunow-prog/lospor-mobile`
- ⬜ Add remote, push main + tag

## Phase 2 — PWA (Vercel)

- ✅ `npm run export:web` → build `dist/`
- ✅ Create second Vercel project from lospor-mobile GitHub repo
  - Build command: `npm run export:web`
  - Output directory: `dist`
  - Install command: `npm install --legacy-peer-deps`
  - Env var: `EXPO_PUBLIC_API_BASE=https://app.lospor.org`
- ✅ Add custom domain `pwa.lospor.org` → CNAME to Vercel
- ✅ Set `MOBILE_PWA_URL=https://pwa.lospor.org` in lospor-app Vercel env vars
- ✅ Redeploy lospor-app

## Phase 3 — Android / Google Play

### Prerequisites
- ⬜ Register Google Play Console account ($25 one-time fee at play.google.com/console)
- ⬜ Wait for account approval (up to 48h)
- ⬜ `npm install -g eas-cli` then `eas login` (account: kaloyandzhunov)

### Build
- ⬜ `eas build --platform android --profile production` (runs in cloud, ~15—20 min)
- ⬜ Download `.aab` from EAS dashboard

### Play Store listing
- ⬜ Prepare phone screenshots (2—8, portrait 1080Г—1920px minimum)
- ⬜ Prepare feature graphic (1024Г—500px, LOSPOR logo on dark background)
- ⬜ Write full Play Store description (Claude can do this)
- ⬜ Create app in Play Console:
  - App name: LOSPOR
  - Category: Medical
  - Privacy policy: https://app.lospor.org/privacy
- ⬜ Fill in data safety form (email/name collected; no patient data; deletion available)
- ⬜ Complete content rating questionnaire

### Upload
- ⬜ Upload `.aab` to Internal testing track
- ⬜ Add release notes
- ⬜ Submit for review (1—7 days first time)
- ⬜ Promote to Production once approved

### Automated future submissions (optional, set up once)
- ⬜ Create Google Cloud service account for Play Console
- ⬜ Download JSON key → save as `google-play-service-account.json` (gitignored)
- ⬜ Future: `eas submit --platform android --profile production`

## Phase 4 — OTA updates (post-launch)

- ⬜ For JS-only changes: `eas update --branch production --message "..."`
- ⬜ For native changes: full build + Play Store submission

## Phase 5 — iOS (PWA path)

- ✅ No extra work — PWA from Phase 2 serves iOS users
- ✅ iOS users: Safari → app.lospor.org → Share → Add to Home Screen

---

## Notes

- `eas.json` dev profile has `192.168.0.107:3000` hardcoded — decide before push whether to replace with placeholder
- `google-play-service-account.json` is gitignored, must be created separately
- `patches/react-native-css-interop+0.2.4.patch` MUST be included in git commit
- EAS project ID already configured: `4b87b715-f0c9-4c6f-b40c-4ade6693b77d`

