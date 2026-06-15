# Google Play — Data Safety & Content Rating draft answers

App: **LOSPOR** (`org.lospor.mobile`)
Drafted from `lospor-app/src/app/(auth)/privacy/page.tsx` (Privacy Policy v1.1) and the
mobile dependency list (no analytics/crash/ads SDKs present).

These are my best-effort recommendations for the current LOSPOR data flows. Play
Console's exact question wording/categories change occasionally — re-check against
the live form before submitting, especially the "Health info" sharing call below.

---

## 1. Data Safety section

**Does your app collect or share any of the required user data types?** → **Yes**

### Security practices
- **Is all user data encrypted in transit?** → **Yes** (HTTPS/TLS only; Supabase EU +
  Vercel EU hosting)
- **Do you provide a way for users to request data deletion?** → **Yes**
  - In-app: Settings → Privacy & Data → Delete Account (mobile and web)
  - Web, no app install required: `https://app.lospor.org` → log in → Settings →
    Privacy & Data → Delete Account
  - Account is soft-deleted immediately, permanently erased within 30 days

### Account deletion URL (separate field in Play Console)
`https://app.lospor.org`
(login required — describe in the field text: "Log in and use Settings → Privacy & Data → Delete Account")

### Data types collected

**Personal info**
| Data type | Collected | Shared | Purpose | Required? |
|---|---|---|---|---|
| Name | Yes | No | Account management, App functionality | Required |
| Email address | Yes | No | Account management, App functionality | Required |
| User IDs | Yes | No | Account management, App functionality | Required |
| Other info (job title, institution) | Yes | No | App functionality | Required |

**Health and fitness**
| Data type | Collected | Shared | Purpose | Required? |
|---|---|---|---|---|
| Health info (perioperative case data: demographics, diagnoses, procedures, anaesthesia technique, vitals, risk scores) | Yes | No* | App functionality | Required (core feature) |

\* *Judgment call:* Supabase (DB), Vercel (hosting), and Mistral AI (3 opt-in AI
features) all process this data as **service providers under GDPR DPAs**, which Play's
definition of "sharing" excludes. Recommend answering "No" to sharing — but if a
reviewer disagrees, the fallback is "Yes, shared with service providers for app
functionality."

**Photos and videos**
| Data type | Collected | Shared | Purpose | Required? | Ephemeral? |
|---|---|---|---|---|---|
| Photos | Yes | No | App functionality (AI lab-report scan, AI monitor scan) | **Optional** (opt-in feature) | **Yes** — processed transiently by Mistral AI, not stored |

**App activity**
| Data type | Collected | Shared | Purpose | Required? |
|---|---|---|---|---|
| App interactions / other user-generated content (audit log: case create/update/delete, AI advisor use, account events) | Yes | No | App functionality, Account management | Required |

**App info and performance**
- Crash logs → **No** (no crash-reporting SDK)
- Diagnostics → **No**
- Other performance data → **No**

**Device or other IDs** → **No** (no advertising ID, no device fingerprinting)

**All other categories** (Location, Financial info, Messages, Web browsing, Files and
docs, Calendar, Contacts, Search history) → **No**

---

## 2. Content rating questionnaire (IARC)

- **App category** → Reference/Educational or Medical (Play Store listing category
  should be **Medical**)
- Violence → No
- Blood/gore → No
- Sexual content / nudity → No
- Profanity / crude humor → No
- Controlled substances (alcohol/tobacco/drugs) → **No** — medication names appear
  only as professional clinical/dosing terminology for documentation, not as
  depicted use, promotion, or recreational reference
- Gambling (real or simulated) → No
- Shares location → No
- User-generated content visible to other users → No (case/handover data is shared
  only between authorised clinicians on the same care team — not public UGC, no
  chat/social features)
- In-app purchases / real-money transactions → No
- Unrestricted web access / browser → No

Expected result: lowest tier (e.g. "Everyone" / PEGI 3) — appropriate for a
professional clinical documentation tool.

---

## 3. Target audience & content

- Target age group → **18+ / Adults** (professional tool for licensed
  anaesthesiologists)
- "Is your app designed for children?" → **No**
- Appeals to children → No

---

## 4. Ads

- Contains ads → **No**

---

## 5. Other declarations

- Government app / COVID-19 app → No
- Financial features (loans, crypto, trading) → No
- News app → No

---

## Reference links

- Privacy policy: `https://app.lospor.org/privacy`
- Terms of service: `https://app.lospor.org/terms`
- Data export (in-app, Settings → Privacy & Data): `/api/user/export`
- Account deletion (in-app, Settings → Privacy & Data): `/api/user/delete`
- Sub-processors: Supabase (EU), Vercel (EU), Mistral AI (EU, La Plateforme) — all
  under GDPR DPAs
