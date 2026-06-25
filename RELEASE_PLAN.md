# LOSPOR Mobile v3.0.0 Release Plan

> **Historical base checklist.** This file started as the original mobile launch checklist and is now superseded by the v3.0.0 release process. See `CHANGELOG.md` for the release history and `app.json` for current store metadata.

Status legend: в¬њ pending В· рџ”„ in progress В· вњ… done

---

## Phase 1 вЂ” Git repository

- в¬њ Add `.expo-static-check/` to .gitignore
- в¬њ Rename branch master в†’ main
- в¬њ Stage and commit all changes (include `patches/`, exclude `.expo-static-check/` and `dist/`)
- в¬њ Tag v3.0.0
- в¬њ Create GitHub repo `kaloyandjunow-prog/lospor-mobile`
- в¬њ Add remote, push main + tag

## Phase 2 вЂ” PWA (Vercel)

- вњ… `npm run export:web` в†’ build `dist/`
- вњ… Create second Vercel project from lospor-mobile GitHub repo
  - Build command: `npm run export:web`
  - Output directory: `dist`
  - Install command: `npm install --legacy-peer-deps`
  - Env var: `EXPO_PUBLIC_API_BASE=https://app.lospor.org`
- вњ… Add custom domain `pwa.lospor.org` в†’ CNAME to Vercel
- вњ… Set `MOBILE_PWA_URL=https://pwa.lospor.org` in lospor-app Vercel env vars
- вњ… Redeploy lospor-app

## Phase 3 вЂ” Android / Google Play

### Prerequisites
- в¬њ Register Google Play Console account ($25 one-time fee at play.google.com/console)
- в¬њ Wait for account approval (up to 48h)
- в¬њ `npm install -g eas-cli` then `eas login` (account: kaloyandzhunov)

### Build
- в¬њ `eas build --platform android --profile production` (runs in cloud, ~15вЂ“20 min)
- в¬њ Download `.aab` from EAS dashboard

### Play Store listing
- в¬њ Prepare phone screenshots (2вЂ“8, portrait 1080Г—1920px minimum)
- в¬њ Prepare feature graphic (1024Г—500px, LOSPOR logo on dark background)
- в¬њ Write full Play Store description (Claude can do this)
- в¬њ Create app in Play Console:
  - App name: LOSPOR
  - Category: Medical
  - Privacy policy: https://app.lospor.org/privacy
- в¬њ Fill in data safety form (email/name collected; no patient data; deletion available)
- в¬њ Complete content rating questionnaire

### Upload
- в¬њ Upload `.aab` to Internal testing track
- в¬њ Add release notes
- в¬њ Submit for review (1вЂ“7 days first time)
- в¬њ Promote to Production once approved

### Automated future submissions (optional, set up once)
- в¬њ Create Google Cloud service account for Play Console
- в¬њ Download JSON key в†’ save as `google-play-service-account.json` (gitignored)
- в¬њ Future: `eas submit --platform android --profile production`

## Phase 4 вЂ” OTA updates (post-launch)

- в¬њ For JS-only changes: `eas update --branch production --message "..."`
- в¬њ For native changes: full build + Play Store submission

## Phase 5 вЂ” iOS (PWA path)

- вњ… No extra work вЂ” PWA from Phase 2 serves iOS users
- вњ… iOS users: Safari в†’ app.lospor.org в†’ Share в†’ Add to Home Screen

---

## Notes

- `eas.json` dev profile has `192.168.0.107:3000` hardcoded вЂ” decide before push whether to replace with placeholder
- `google-play-service-account.json` is gitignored, must be created separately
- `patches/react-native-css-interop+0.2.4.patch` MUST be included in git commit
- EAS project ID already configured: `4b87b715-f0c9-4c6f-b40c-4ade6693b77d`

