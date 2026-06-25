import { usePreferences } from "@/lib/preferences-context"
import {
  cmToInches, inchesToCm, kgToLb, lbToKg,
  celsiusToFahrenheit, fahrenheitToCelsius, mmHgToKPa, kPaToMmHg,
} from "@/lib/unit-conversion"

// Converts canonical value + range into display-unit value + range based on
// the user's Settings → Units preference, for height/weight/temperature/
// EtCO2 entry. The canonical value (cm/kg/°C/mmHg) is what's stored and what
// the caller continues to read/write — this only changes what's shown/typed.
// Spread the result into whichever input component a call site already uses
// (ClinicalNumberInput, VitalNumber, or a plain TextInput).
//
// convertedMeasurement() is a plain function, not a hook, so it's safe to
// call inside a Controller `render` callback (which isn't a real component
// by React's rules-of-hooks definition) — call usePreferences() once at the
// top of your screen component and pass the result in.

export type Measurement = "height" | "weight" | "temperature" | "etco2"
export type UnitPrefs = { heightUnit: "cm" | "in"; weightUnit: "kg" | "lb"; temperatureUnit: "C" | "F"; etco2Unit: "mmHg" | "kPa" }

const DISPLAY: Record<Measurement, { altUnit: string; canonUnit: string; altStep: number; precision: number; toAlt: (v: number) => number; toCanon: (v: number) => number }> = {
  height:      { altUnit: "in",  canonUnit: "cm",   altStep: 0.5, precision: 1, toAlt: cmToInches,          toCanon: inchesToCm },
  weight:      { altUnit: "lb",  canonUnit: "kg",   altStep: 1,   precision: 1, toAlt: kgToLb,              toCanon: lbToKg },
  temperature: { altUnit: "°F",  canonUnit: "°C",   altStep: 0.2, precision: 1, toAlt: celsiusToFahrenheit, toCanon: fahrenheitToCelsius },
  etco2:       { altUnit: "kPa", canonUnit: "mmHg", altStep: 0.1, precision: 1, toAlt: mmHgToKPa,           toCanon: kPaToMmHg },
}

export function convertedMeasurement(
  measurement: Measurement,
  prefs: UnitPrefs,
  canonicalValue: number | undefined,
  onCanonicalChange: (v: number | undefined) => void,
  canonicalMin: number,
  canonicalMax: number,
  canonicalStep: number,
) {
  const cfg = DISPLAY[measurement]
  const usingAlt =
    (measurement === "height" && prefs.heightUnit === "in") ||
    (measurement === "weight" && prefs.weightUnit === "lb") ||
    (measurement === "temperature" && prefs.temperatureUnit === "F") ||
    (measurement === "etco2" && prefs.etco2Unit === "kPa")

  if (!usingAlt) {
    return { value: canonicalValue, onChange: onCanonicalChange, min: canonicalMin, max: canonicalMax, step: canonicalStep, unit: cfg.canonUnit, precision: 0 }
  }

  const round = (v: number) => Math.round(v * 10 ** cfg.precision) / 10 ** cfg.precision

  return {
    value: canonicalValue != null ? round(cfg.toAlt(canonicalValue)) : undefined,
    onChange: (v: number | undefined) => onCanonicalChange(v != null ? round(cfg.toCanon(v)) : undefined),
    min: round(cfg.toAlt(canonicalMin)),
    max: round(cfg.toAlt(canonicalMax)),
    step: cfg.altStep,
    unit: cfg.altUnit,
    precision: cfg.precision,
  }
}

// Convenience for top-level use (outside a render callback) — reads prefs itself.
export function useConvertedMeasurement(
  measurement: Measurement,
  canonicalValue: number | undefined,
  onCanonicalChange: (v: number | undefined) => void,
  canonicalMin: number,
  canonicalMax: number,
  canonicalStep: number,
) {
  const prefs = usePreferences()
  return convertedMeasurement(measurement, prefs, canonicalValue, onCanonicalChange, canonicalMin, canonicalMax, canonicalStep)
}
