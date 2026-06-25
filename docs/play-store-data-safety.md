# Google Play вЂ” Data Safety & Content Rating draft answers

App: **LOSPOR** (`org.lospor.mobile`)
Drafted from `lospor-app/src/app/(auth)/privacy/page.tsx` (Privacy Policy v3.0) and the
mobile dependency list (no analytics/crash/ads SDKs present).

These are my best-effort recommendations for the current LOSPOR data flows. Play
Console's exact question wording/categories change occasionally вЂ” re-check against
the live form before submitting, especially the "Health info" sharing call below.

---

## 1. Data Safety section

**Does your app collect or share any of the required user data types?** в†’ **Yes**

### Security practices
- **Is all user data encrypted in transit?** в†’ **Yes** (HTTPS/TLS only; Supabase EU +
  Vercel EU hosting)
- **Do you provide a way for users to request data deletion?** в†’ **Yes**
  - In-app: Settings в†’ Privacy & Data в†’ Delete Account (mobile and web)
  - Web, no app install required: `https://app.lospor.org` в†’ log in в†’ Settings в†’
    Privacy & Data в†’ Delete Account
  - Account is soft-deleted immediately, permanently erased within 30 days

### Account deletion URL (separate field in Play Console)
`https://app.lospor.org`
(login required вЂ” describe in the field text: "Log in and use Settings в†’ Privacy & Data в†’ Delete Account")

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
definition of "sharing" excludes. Recommend answering "No" to sharing вЂ” but if a
reviewer disagrees, the fallback is "Yes, shared with service providers for app
functionality."

**Photos and videos**
| Data type | Collected | Shared | Purpose | Required? | Ephemeral? |
|---|---|---|---|---|---|
| Photos | Yes | No | App functionality (AI lab-report scan, AI monitor scan) | **Optional** (opt-in feature) | **Yes** вЂ” processed transiently by Mistral AI, not stored |

**App activity**
| Data type | Collected | Shared | Purpose | Required? |
|---|---|---|---|---|
| App interactions / other user-generated content (audit log: case create/update/delete, AI advisor use, account events) | Yes | No | App functionality, Account management | Required |

**App info and performance**
- Crash logs в†’ **No** (no crash-reporting SDK)
- Diagnostics в†’ **No**
- Other performance data в†’ **No**

**Device or other IDs** в†’ **No** (no advertising ID, no device fingerprinting)

**All other categories** (Location, Financial info, Messages, Web browsing, Files and
docs, Calendar, Contacts, Search history) в†’ **No**

---

## 2. Content rating questionnaire (IARC)

- **App category** в†’ Reference/Educational or Medical (Play Store listing category
  should be **Medical**)
- Violence в†’ No
- Blood/gore в†’ No
- Sexual content / nudity в†’ No
- Profanity / crude humor в†’ No
- Controlled substances (alcohol/tobacco/drugs) в†’ **No** вЂ” medication names appear
  only as professional clinical/dosing terminology for documentation, not as
  depicted use, promotion, or recreational reference
- Gambling (real or simulated) в†’ No
- Shares location в†’ No
- User-generated content visible to other users в†’ No (case/handover data is shared
  only between authorised clinicians on the same care team вЂ” not public UGC, no
  chat/social features)
- In-app purchases / real-money transactions в†’ No
- Unrestricted web access / browser в†’ No

Expected result: lowest tier (e.g. "Everyone" / PEGI 3) вЂ” appropriate for a
professional clinical documentation tool.

---

## 3. Target audience & content

- Target age group в†’ **18+ / Adults** (professional tool for licensed
  anaesthesiologists)
- "Is your app designed for children?" в†’ **No**
- Appeals to children в†’ No

---

## 4. Ads

- Contains ads в†’ **No**

---

## 5. Other declarations

- Government app / COVID-19 app в†’ No
- Financial features (loans, crypto, trading) в†’ No
- News app в†’ No

---

## Reference links

- Privacy policy: `https://app.lospor.org/privacy`
- Terms of service: `https://app.lospor.org/terms`
- Data export (in-app, Settings в†’ Privacy & Data): `/api/user/export`
- Account deletion (in-app, Settings в†’ Privacy & Data): `/api/user/delete`
- Sub-processors: Supabase (EU), Vercel (EU), Mistral AI (EU, La Plateforme) вЂ” all
  under GDPR DPAs

