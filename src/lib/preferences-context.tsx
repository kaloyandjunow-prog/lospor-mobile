import React, { createContext, useContext, useEffect, useMemo, useState } from "react"
import * as SecureStore from "expo-secure-store"
import { setColorScheme, type ColorScheme } from "@/theme/colors"
import { CLINICAL_STRINGS, type ClinicalStringKey } from "@/i18n/clinical-strings"
import { STRINGS } from "@/i18n/strings"

export type AppLanguage = "en" | "bg"
export type HeightUnit = "cm" | "in"
export type WeightUnit = "kg" | "lb"
export type TemperatureUnit = "C" | "F"
export type Etco2Unit = "mmHg" | "kPa"

const LANGUAGE_KEY = "lospor_language"
const THEME_KEY = "lospor_theme"
const PREOP_LAYOUT_KEY = "lospor_preop_layout"
// Display-unit preferences only — the DB and every save path always use the
// canonical unit (cm/kg/°C/mmHg); these just control what's shown/typed in
// the UI. See src/lib/unit-conversion.ts for the conversion functions.
const HEIGHT_UNIT_KEY = "lospor_height_unit"
const WEIGHT_UNIT_KEY = "lospor_weight_unit"
const TEMPERATURE_UNIT_KEY = "lospor_temperature_unit"
const ETCO2_UNIT_KEY = "lospor_etco2_unit"


type TranslationKey = keyof typeof STRINGS.en
type ClinicalStringsMap = Record<ClinicalStringKey, string>

type PreferencesContextValue = {
  language: AppLanguage
  theme: ColorScheme
  preopLayout: "sections" | "scroll"
  heightUnit: HeightUnit
  weightUnit: WeightUnit
  temperatureUnit: TemperatureUnit
  etco2Unit: Etco2Unit
  setLanguage: (language: AppLanguage) => Promise<void>
  setTheme: (theme: ColorScheme) => Promise<void>
  setPreopLayout: (layout: "sections" | "scroll") => Promise<void>
  setHeightUnit: (unit: HeightUnit) => Promise<void>
  setWeightUnit: (unit: WeightUnit) => Promise<void>
  setTemperatureUnit: (unit: TemperatureUnit) => Promise<void>
  setEtco2Unit: (unit: Etco2Unit) => Promise<void>
  t: (key: TranslationKey) => string
  /** Clinical string translator — covers UI labels in preop, intraop, postop, summary etc. */
  tc: (key: ClinicalStringKey) => string
}

export type { ClinicalStringKey, TranslationKey }

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en")
  const [theme, setThemeState] = useState<ColorScheme>("dark")
  const [preopLayout, setPreopLayoutState] = useState<"sections" | "scroll">("scroll")
  const [heightUnit, setHeightUnitState] = useState<HeightUnit>("cm")
  const [weightUnit, setWeightUnitState] = useState<WeightUnit>("kg")
  const [temperatureUnit, setTemperatureUnitState] = useState<TemperatureUnit>("C")
  const [etco2Unit, setEtco2UnitState] = useState<Etco2Unit>("mmHg")

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
    SecureStore.getItemAsync(HEIGHT_UNIT_KEY).then((stored) => {
      if (stored === "cm" || stored === "in") setHeightUnitState(stored)
    })
    SecureStore.getItemAsync(WEIGHT_UNIT_KEY).then((stored) => {
      if (stored === "kg" || stored === "lb") setWeightUnitState(stored)
    })
    SecureStore.getItemAsync(TEMPERATURE_UNIT_KEY).then((stored) => {
      if (stored === "C" || stored === "F") setTemperatureUnitState(stored)
    })
    SecureStore.getItemAsync(ETCO2_UNIT_KEY).then((stored) => {
      if (stored === "mmHg" || stored === "kPa") setEtco2UnitState(stored)
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

  async function setHeightUnit(unit: HeightUnit) {
    setHeightUnitState(unit)
    await SecureStore.setItemAsync(HEIGHT_UNIT_KEY, unit)
  }

  async function setWeightUnit(unit: WeightUnit) {
    setWeightUnitState(unit)
    await SecureStore.setItemAsync(WEIGHT_UNIT_KEY, unit)
  }

  async function setTemperatureUnit(unit: TemperatureUnit) {
    setTemperatureUnitState(unit)
    await SecureStore.setItemAsync(TEMPERATURE_UNIT_KEY, unit)
  }

  async function setEtco2Unit(unit: Etco2Unit) {
    setEtco2UnitState(unit)
    await SecureStore.setItemAsync(ETCO2_UNIT_KEY, unit)
  }

  const value = useMemo<PreferencesContextValue>(() => ({
    language,
    theme,
    preopLayout,
    heightUnit,
    weightUnit,
    temperatureUnit,
    etco2Unit,
    setLanguage,
    setTheme,
    setPreopLayout,
    setHeightUnit,
    setWeightUnit,
    setTemperatureUnit,
    setEtco2Unit,
    t:  (key) => STRINGS[language][key] ?? STRINGS.en[key],
    tc: (key) => (CLINICAL_STRINGS[language] as ClinicalStringsMap)[key] ?? (CLINICAL_STRINGS.en as ClinicalStringsMap)[key] ?? key,
  }), [language, theme, preopLayout, heightUnit, weightUnit, temperatureUnit, etco2Unit])

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider")
  return ctx
}
