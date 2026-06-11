import React, { createContext, useContext, useEffect, useMemo, useState } from "react"
import * as SecureStore from "expo-secure-store"
import { setColorScheme, type ColorScheme } from "@/theme/colors"
import { CLINICAL_STRINGS, type ClinicalStringKey } from "@/i18n/clinical-strings"

export type AppLanguage = "en" | "bg"

const LANGUAGE_KEY = "lospor_language"
const THEME_KEY = "lospor_theme"
const PREOP_LAYOUT_KEY = "lospor_preop_layout"

const STRINGS = {
  en: {
    settings: "Settings",
    cases: "Cases",
    loadingCases: "Loading cases",
    searchPlaceholder: "Search procedure, diagnosis, case code",
    offlineSaves: "offline saves waiting to sync",
    offlineSave: "offline save waiting to sync",
    keepOpen: "Keep the app open; this retries automatically.",
    total: "Total",
    month: "Month",
    icu: "ICU",
    pendingHandovers: "Pending handovers",
    from: "From",
    accept: "Accept",
    decline: "Decline",
    noCasesHere: "No cases here",
    noHandoversPending: "No handovers pending",
    casesCouldNotLoad: "Cases could not load",
    tryAnotherSearch: "Try another search or clear the filter.",
    tapCreateCase: "Tap + to create your first case.",
    account: "Account",
    language: "Language",
    theme: "Theme",
    darkTheme: "Dark",
    lightTheme: "Light",
    english: "English",
    bulgarian: "Bulgarian",
    exportData: "Export data",
    exportDataSub: "Download your cases as CSV or JSON",
    deleteAccount: "Delete account",
    preopLayout: "Preop layout",
    preopLayoutSections: "Sections",
    preopLayoutScroll: "Scrollable",
    signOut: "Sign out",
    diagnostics: "Diagnostics",
    administration: "Administration",
    adminConsole: "Admin console",
    adminConsoleSub: "Registrations, HOD requests, and roles",
    auditLogs: "Audit logs",
    auditLogsSub: "Admin-only security and case activity",
    privacyData: "Privacy & Data",
    privacyPolicy: "Privacy policy",
    terms: "Terms of use",
    about: "About",
    docs: "Docs",
    reportBug: "Report a bug",
    editInstitution: "Edit institution",
    viewProfile: "View profile",
    institutionSearch: "Search institutions…",
    institutionUpdated: "Institution updated",
    adminOnly: "Admin only",
    adminUnavailable: "Admin unavailable",
    adminRequired: "Admin access is required.",
    loadingAdmin: "Loading admin",
    adminSubtitle: "Approve registrations, HOD requests, and user roles.",
    registrations: "Registrations",
    hodRequests: "HOD Requests",
    users: "Users",
    nothingPending: "Nothing pending",
    noApprovedUsers: "No approved users found.",
    queueClear: "This queue is clear.",
    noInstitution: "No institution",
    reject: "Reject",
    approve: "Approve",
    approveHod: "Approve HOD",
    member: "Member",
    hod: "HOD",
    requested: "Requested",
    rejectRegistration: "Reject registration",
    deleteUserQuestion: "Delete this user?",
    cancel: "Cancel",
    error: "Error",
    actionFailed: "Could not complete action.",
    loadingAuditLogs: "Loading audit logs",
    auditUnavailable: "Audit logs unavailable",
    auditAdminOnly: "Audit logs are available to administrators only.",
    events: "events",
    newestAuditFirst: "Newest audit entries first",
    unknownUser: "Unknown user",
    entity: "Entity",
    loadMore: "Load more",
    loadingCase: "Loading case",
    caseNotAvailable: "Case not available",
    caseNotFound: "Case not found.",
    shareSummary: "Share summary",
    openPrintableProtocol: "Open printable protocol",
    editPreop: "Edit preoperative",
    editIntraop: "Edit intraoperative",
    editPostop: "Edit postoperative",
    aiAdvisor: "AI Advisor",
    handOver: "Hand over",
    finaliseCase: "Finalise case",
    deleteCase: "Delete case",

    // ── Settings — intraoperative automation ──────────────────────────────────
    intraoperative: "Intraoperative",
    autoFillVitals: "Auto-fill vitals",
    autoFillVitalsSub: "Carry forward EtCO₂, temperature and SpO₂ as time advances on the timetable",
    autoFillBpHr: "Also fill BP and HR",
    autoFillBpHrSub: "Include blood pressure and heart rate in the carry-forward",
    backgroundAutoFill: "Background auto-fill",
    backgroundAutoFillSub: "When reopening a case, backfill the gap from the last entry to the current time",

    // ── Settings — sign-out / export / delete dialogs ─────────────────────────
    signOutConfirmTitle: "Sign out",
    signOutConfirmMsg: "Are you sure you want to sign out?",
    exportDataTitle: "Export data",
    exportDataMsg: "Data export is available on the web app at app.lospor.org/settings.",
    openWebApp: "Open web app",
    deleteAccountTitle: "Delete account",
    deleteAccountMsg: "This will permanently delete your account and all associated data. This action cannot be undone.\n\nAre you sure you want to delete your account?",
    deleteAccountConfirm: "Delete account",
    deleteAccountError: "Could not delete account. Please try again or contact support.",

    // ── Settings — diagnostics rows ───────────────────────────────────────────
    diagApiBase: "API base URL",
    diagAuthToken: "Auth token",
    diagTokenPresentValid: "Present, valid",
    diagTokenPresentExpired: "Present, expired",
    diagTokenMissing: "Missing",
    diagRole: "Role",
    diagInstitution: "Institution",
    diagUserId: "User id",
    diagExpires: "Expires",
    diagQueuedSaves: "Queued offline saves",
    diagLastOk: "Last successful request",
    diagLastError: "Last API error",
    diagRefreshHint: "Tap the last row to refresh diagnostics.",
    diagNoneYet: "None yet",
    diagNone: "None",
    diagUnknown: "Unknown",

    // ── Dashboard ─────────────────────────────────────────────────────────────
    dashboard: "Dashboard",
    newCase: "New case",
    filterAll: "All",
    filterToday: "Today",
    filterActive: "Active",
    filterDrafts: "Drafts",
    filterAwaitingPostop: "Awaiting Postop",
    filterComplete: "Complete",
    filterHandovers: "Handovers",
    unsyncedDraftTitle: "Unsynced local draft",
    unsyncedDraftMsg: "Saved on device while offline — tap to continue and sync.",
    searchCases: "Search cases",
    searchCasesPlaceholder: "Procedure, diagnosis or case code…",
    searchPrefix: "Search:",
    showInDashboard: "Show in dashboard",
    noCasesFound: "No cases found",
    noColleaguesFound: "No colleagues found.",
    assignTo: "Assign to",
    retry: "Retry",
    back: "Back",

    // next-action labels shown on case cards
    reviewCase: "Review case",
    openIntraop: "Open intraop",
    awaitingAllocation: "Awaiting allocation",
    continuePreop: "Continue preop",

    // ── Case detail ───────────────────────────────────────────────────────────
    caseDetails: "Case details",
    noPreopData: "No preoperative data recorded.",
    infusions: "Infusions",
    emergencyChip: "EMERGENCY",
    highRiskChip: "HIGH-RISK SURGERY",
    freshGasFlow: "Fresh gas flow",
    carrierGas: "Carrier gas",
    fio2Label: "FiO₂",
    unfinalizeCase: "Unfinalize case",
    unfinalizeCaseMsg: "This will re-open the case for editing. Continue?",
    unfinalizing: "Unfinalizing…",
    deleteCaseTitle: "Delete case",
    deleteCaseMsg: "This action cannot be undone. Are you sure you want to delete this case?",
    couldNotUnfinalize: "Could not unfinalize case. Please try again.",
    couldNotDelete: "Could not delete case. Please try again.",

    // ── EditWindowBanner ──────────────────────────────────────────────────────
    editWindowClosesIn: "Edit window closes in",
    summaryBack: "← Summary",

    // ── Postop form ───────────────────────────────────────────────────────────
    loadingRecovery: "Loading recovery",
    savedLocally: "Saved locally",
    savedLocallyMsg: "Network is unavailable. This recovery form will sync automatically when the server is reachable.",
    savedAt: "Saved",
    overwriteNewerTitle: "Overwrite newer data?",
    overwriteNewerMsg: "This will replace the postoperative data saved elsewhere with the values currently on this device.",
    overwrite: "Overwrite",
    couldNotOverwrite: "Could not overwrite data.",
    couldNotReload: "Could not reload latest data.",
    backToIntraop: "← Back to intraop",
    handoverNotesPlaceholder: "Any relevant handover notes…",
    continuedPostop: "Continued postoperatively:",
    aldreteLabel: "Aldrete",
    painLabel: "Pain",
    ponvPresent: "PONV present",
    noPONV: "No PONV",
    noDisposition: "No disposition",
    yesLabel: "Yes",
    noLabel: "No",

    // ── SearchTagInput ────────────────────────────────────────────────────────
    addMore: "Add more...",
    done: "Done",
    typeAtLeast2: "Type at least 2 characters",
    noResultsFor: "No results for",
    addedLabel: "Added",
  },
  bg: {
    settings: "Настройки",
    cases: "Случаи",
    loadingCases: "Зареждане на случаи",
    searchPlaceholder: "Търсене по процедура, диагноза, код",
    offlineSaves: "локални записа чакат синхронизация",
    offlineSave: "локален запис чака синхронизация",
    keepOpen: "Оставете приложението отворено; ще опита автоматично.",
    total: "Общо",
    month: "Месец",
    icu: "ОАИЛ",
    pendingHandovers: "Чакащи предавания",
    from: "От",
    accept: "Приеми",
    decline: "Откажи",
    noCasesHere: "Няма случаи",
    noHandoversPending: "Няма чакащи предавания",
    casesCouldNotLoad: "Случаите не се заредиха",
    tryAnotherSearch: "Опитайте друго търсене или изчистете филтъра.",
    tapCreateCase: "Натиснете + за нов случай.",
    account: "Профил",
    language: "Език",
    theme: "Тема",
    darkTheme: "Тъмна",
    lightTheme: "Светла",
    english: "Английски",
    bulgarian: "Български",
    exportData: "Експорт на данни",
    exportDataSub: "Изтегляне на случаите като CSV или JSON",
    deleteAccount: "Изтриване на профил",
    preopLayout: "Преоп. изглед",
    preopLayoutSections: "Секции",
    preopLayoutScroll: "Превъртане",
    signOut: "Изход",
    diagnostics: "Диагностика",
    administration: "Администрация",
    adminConsole: "Админ панел",
    adminConsoleSub: "Регистрации, HOD заявки и роли",
    auditLogs: "Одит логове",
    auditLogsSub: "Само за админи: сигурност и активност",
    privacyData: "Поверителност и данни",
    privacyPolicy: "Политика за поверителност",
    terms: "Условия за ползване",
    about: "Относно",
    docs: "Документация",
    reportBug: "Докладвай проблем",
    editInstitution: "Промени институция",
    viewProfile: "Виж профил",
    institutionSearch: "Търси институции…",
    institutionUpdated: "Институцията е актуализирана",
    adminOnly: "Само за админи",
    adminUnavailable: "Админ панелът е недостъпен",
    adminRequired: "Изисква се админ достъп.",
    loadingAdmin: "Зареждане на админ панел",
    adminSubtitle: "Одобряване на регистрации, HOD заявки и роли.",
    registrations: "Регистрации",
    hodRequests: "HOD заявки",
    users: "Потребители",
    nothingPending: "Няма чакащи заявки",
    noApprovedUsers: "Няма одобрени потребители.",
    queueClear: "Опашката е празна.",
    noInstitution: "Няма институция",
    reject: "Откажи",
    approve: "Одобри",
    approveHod: "Одобри HOD",
    member: "Член",
    hod: "HOD",
    requested: "Заявено",
    rejectRegistration: "Отказ на регистрация",
    deleteUserQuestion: "Да се изтрие ли този потребител?",
    cancel: "Отказ",
    error: "Грешка",
    actionFailed: "Действието не бе изпълнено.",
    loadingAuditLogs: "Зареждане на одит логове",
    auditUnavailable: "Одит логовете са недостъпни",
    auditAdminOnly: "Одит логовете са достъпни само за админи.",
    events: "събития",
    newestAuditFirst: "Най-новите записи са първи",
    unknownUser: "Неизвестен потребител",
    entity: "Обект",
    loadMore: "Зареди още",
    loadingCase: "Зареждане на случай",
    caseNotAvailable: "Случаят не е достъпен",
    caseNotFound: "Случаят не е намерен.",
    shareSummary: "Сподели резюме",
    openPrintableProtocol: "Отвори протокол за печат",
    editPreop: "Редактирай предоперативно",
    editIntraop: "Редактирай интраоперативно",
    editPostop: "Редактирай следоперативно",
    aiAdvisor: "AI съветник",
    handOver: "Предай случай",
    finaliseCase: "Финализирай случай",
    deleteCase: "Изтрий случай",

    // ── Settings — intraoperative automation ──────────────────────────────────
    intraoperative: "Интраоперативно",
    autoFillVitals: "Автоматично попълване на витали",
    autoFillVitalsSub: "Пренася EtCO₂, температура и SpO₂ напред при движение по тайм-таблицата",
    autoFillBpHr: "Включи и АН и СЧ",
    autoFillBpHrSub: "Включва артериално налягане и сърдечна честота в пренасянето напред",
    backgroundAutoFill: "Фоново автопопълване",
    backgroundAutoFillSub: "При отваряне на случай, попълва пропуснатия период от последния запис до текущото време",

    // ── Settings — sign-out / export / delete dialogs ─────────────────────────
    signOutConfirmTitle: "Изход",
    signOutConfirmMsg: "Сигурни ли сте, че искате да излезете?",
    exportDataTitle: "Експорт на данни",
    exportDataMsg: "Експортът на данни е достъпен в уеб приложението на app.lospor.org/settings.",
    openWebApp: "Отвори уеб приложението",
    deleteAccountTitle: "Изтриване на профил",
    deleteAccountMsg: "Това ще изтрие окончателно вашия профил и всички свързани данни. Действието не може да бъде отменено.\n\nСигурни ли сте, че искате да изтриете профила си?",
    deleteAccountConfirm: "Изтрий профила",
    deleteAccountError: "Профилът не можа да бъде изтрит. Опитайте отново или се свържете с поддръжка.",

    // ── Settings — diagnostics rows ───────────────────────────────────────────
    diagApiBase: "API адрес",
    diagAuthToken: "Токен за вход",
    diagTokenPresentValid: "Наличен, валиден",
    diagTokenPresentExpired: "Наличен, изтекъл",
    diagTokenMissing: "Липсва",
    diagRole: "Роля",
    diagInstitution: "Институция",
    diagUserId: "ID на потребителя",
    diagExpires: "Изтича",
    diagQueuedSaves: "Опашка за синхронизация",
    diagLastOk: "Последна успешна заявка",
    diagLastError: "Последна грешка от API",
    diagRefreshHint: "Докоснете последния ред за обновяване на диагностиката.",
    diagNoneYet: "Все още няма",
    diagNone: "Няма",
    diagUnknown: "Неизвестно",

    // ── Dashboard ─────────────────────────────────────────────────────────────
    dashboard: "Начало",
    newCase: "Нов случай",
    filterAll: "Всички",
    filterToday: "Днес",
    filterActive: "Активни",
    filterDrafts: "Чернови",
    filterAwaitingPostop: "Чакат следоп.",
    filterComplete: "Завършени",
    filterHandovers: "Предавания",
    unsyncedDraftTitle: "Несинхронизирана чернова",
    unsyncedDraftMsg: "Запазено локално при липса на мрежа — докоснете за продължаване.",
    searchCases: "Търсене на случаи",
    searchCasesPlaceholder: "Процедура, диагноза или код на случай…",
    searchPrefix: "Търсене:",
    showInDashboard: "Покажи в началото",
    noCasesFound: "Не са намерени случаи",
    noColleaguesFound: "Не са намерени колеги.",
    assignTo: "Назначи на",
    retry: "Опитай отново",
    back: "Назад",

    // next-action labels shown on case cards
    reviewCase: "Преглед на случая",
    openIntraop: "Отвори интраоп.",
    awaitingAllocation: "Чака разпределение",
    continuePreop: "Продължи предоп.",

    // ── Case detail ───────────────────────────────────────────────────────────
    caseDetails: "Детайли на случая",
    noPreopData: "Няма въведени предоперативни данни.",
    infusions: "Инфузии",
    emergencyChip: "СПЕШНА",
    highRiskChip: "ВИСОК РИСК",
    freshGasFlow: "Пресен газов поток",
    carrierGas: "Носещ газ",
    fio2Label: "FiO₂",
    unfinalizeCase: "Отвори отново",
    unfinalizeCaseMsg: "Случаят ще бъде отворен отново за редакция. Продължавате?",
    unfinalizing: "Отваря се…",
    deleteCaseTitle: "Изтрий случай",
    deleteCaseMsg: "Действието не може да бъде отменено. Сигурни ли сте, че искате да изтриете случая?",
    couldNotUnfinalize: "Случаят не можа да бъде отворен отново. Опитайте пак.",
    couldNotDelete: "Случаят не можа да бъде изтрит. Опитайте пак.",

    // ── EditWindowBanner ──────────────────────────────────────────────────────
    editWindowClosesIn: "Прозорецът за редакция се затваря след",
    summaryBack: "← Резюме",

    // ── Postop form ───────────────────────────────────────────────────────────
    loadingRecovery: "Зареждане на събуждане",
    savedLocally: "Запазено локално",
    savedLocallyMsg: "Няма мрежа. Формуляра ще се синхронизира автоматично при достъп.",
    savedAt: "Запазено",
    overwriteNewerTitle: "Презапиши по-новите данни?",
    overwriteNewerMsg: "Това ще замени следоперативните данни, запазени другаде, с текущите стойности на устройството.",
    overwrite: "Презапиши",
    couldNotOverwrite: "Данните не можаха да бъдат презаписани.",
    couldNotReload: "Последните данни не можаха да бъдат заредени.",
    backToIntraop: "← Назад към интраоп.",
    handoverNotesPlaceholder: "Бележки при предаване…",
    continuedPostop: "Продължено следоперативно:",
    aldreteLabel: "Алдрете",
    painLabel: "Болка",
    ponvPresent: "ПОПМ налице",
    noPONV: "Без ПОПМ",
    noDisposition: "Без насочване",
    yesLabel: "Да",
    noLabel: "Не",

    // ── SearchTagInput ────────────────────────────────────────────────────────
    addMore: "Добави още...",
    done: "Готово",
    typeAtLeast2: "Въведете поне 2 символа",
    noResultsFor: "Няма резултати за",
    addedLabel: "Добавено",
  },
} as const

type TranslationKey = keyof typeof STRINGS.en

type PreferencesContextValue = {
  language: AppLanguage
  theme: ColorScheme
  preopLayout: "sections" | "scroll"
  setLanguage: (language: AppLanguage) => Promise<void>
  setTheme: (theme: ColorScheme) => Promise<void>
  setPreopLayout: (layout: "sections" | "scroll") => Promise<void>
  t: (key: TranslationKey) => string
  /** Clinical string translator — covers UI labels in preop, intraop, postop, summary etc. */
  tc: (key: ClinicalStringKey) => string
}

export type { ClinicalStringKey }

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en")
  const [theme, setThemeState] = useState<ColorScheme>("dark")
  const [preopLayout, setPreopLayoutState] = useState<"sections" | "scroll">("scroll")

  useEffect(() => {
    SecureStore.getItemAsync(LANGUAGE_KEY).then((stored) => {
      if (stored === "en" || stored === "bg") setLanguageState(stored)
    })
    SecureStore.getItemAsync(THEME_KEY).then((stored) => {
      if (stored === "dark" || stored === "light") {
        setThemeState(stored)
        setColorScheme(stored)
      }
    })
    SecureStore.getItemAsync(PREOP_LAYOUT_KEY).then((stored) => {
      if (stored === "sections" || stored === "scroll") setPreopLayoutState(stored)
    })
  }, [])

  async function setLanguage(language: AppLanguage) {
    setLanguageState(language)
    await SecureStore.setItemAsync(LANGUAGE_KEY, language)
  }

  async function setTheme(theme: ColorScheme) {
    setThemeState(theme)
    setColorScheme(theme)
    await SecureStore.setItemAsync(THEME_KEY, theme)
  }

  async function setPreopLayout(layout: "sections" | "scroll") {
    setPreopLayoutState(layout)
    await SecureStore.setItemAsync(PREOP_LAYOUT_KEY, layout)
  }

  const value = useMemo<PreferencesContextValue>(() => ({
    language,
    theme,
    preopLayout,
    setLanguage,
    setTheme,
    setPreopLayout,
    t:  (key) => STRINGS[language][key] ?? STRINGS.en[key],
    tc: (key) => (CLINICAL_STRINGS[language] as any)[key] ?? (CLINICAL_STRINGS.en as any)[key] ?? key,
  }), [language, theme, preopLayout])

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider")
  return ctx
}
