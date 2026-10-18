import { useEffect, useState } from "react"
import type { DoseLimit } from "@lospor/core/catalog"
import {
  isPerKgVolumeRate,
  volumeRateFromPump,
  volumeRateReadout,
  volumeRateSurface,
} from "@lospor/core/volume-dose"
import type { DoseSelectorProps } from "@/components/intraop/DoseSelector"
import { usePreferences } from "@/lib/preferences-context"

const PUMP_UNIT = "mL/hr"

type SelectorPart = Pick<DoseSelectorProps,
  "value" | "onValueChange" | "min" | "max" | "step" | "quickValues" | "unitSuffix" | "units" | "unit" | "onUnitChange">

/**
 * A local anaesthetic infusion entered as volume (mL/kg/hr for a child). The
 * slider maximum and pills follow the strength picked so the dose stays under
 * the rule's limit, the pump rate (mL/hr) and the dose are read out beside it,
 * and the pump rate can be typed instead -- it is turned back into mL/kg/hr,
 * which is what is recorded. Any other infusion passes through unchanged.
 *
 * Same conversions as the web (core volume-dose.ts).
 */
export function useVolumeRateEntry(input: {
  unit: string
  min: number
  max: number
  step: number
  quickValues?: number[]
  doseLimit?: DoseLimit
  concentration?: string
  weightKg?: number | null
  rate: string
  setRate: (value: string) => void
}): {
  selector: SelectorPart
  readout?: string
  /** The volume rate to suggest after the strength changes, when the rule has one. */
  suggestedFor: (concentration: string | undefined) => string | undefined
} {
  const { tc } = usePreferences()
  const { unit, rate, setRate, concentration } = input
  const weight = input.weightKg != null && input.weightKg > 0 ? input.weightKg : null
  const pumpAvailable = isPerKgVolumeRate(unit) && weight != null
  const [pumpMode, setPumpMode] = useState(false)
  const [pumpText, setPumpText] = useState("")
  useEffect(() => { if (!pumpAvailable) setPumpMode(false) }, [pumpAvailable])

  const surface = volumeRateSurface({
    max: input.max,
    step: input.step,
    quickValues: input.quickValues ?? [],
    doseLimit: input.doseLimit,
    concentration,
  })
  const suggestedFor = (next: string | undefined) => {
    if (!input.doseLimit) return undefined
    const suggested = volumeRateSurface({ ...input, quickValues: [], concentration: next }).suggestedRate
    return suggested == null ? undefined : String(suggested)
  }

  const numeric = Number(rate)
  const readout = rate && Number.isFinite(numeric) && /^mL\//i.test(unit)
    ? volumeRateReadout({ rate: numeric, unit, concentration, weightKg: weight })
    : null
  const dose = readout?.doseRate ? `${readout.doseRate.value} ${readout.doseRate.unit}` : null
  const readoutText = readout
    ? pumpMode
      ? [`${rate} ${unit}`, dose].filter(Boolean).join(" · ")
      : [isPerKgVolumeRate(unit) && readout.pumpMlPerHour != null ? `${readout.pumpMlPerHour} ${PUMP_UNIT} ${tc("volumeOnPump")}` : null, dose]
          .filter(Boolean).join(" · ")
    : ""

  const switchUnit = (next: string) => {
    const toPump = next === PUMP_UNIT
    if (toPump === pumpMode) return
    if (toPump) setPumpText(readout?.pumpMlPerHour != null ? String(readout.pumpMlPerHour) : "")
    setPumpMode(toPump)
  }
  const units = pumpAvailable ? { units: [unit, PUMP_UNIT], unit: pumpMode ? PUMP_UNIT : unit, onUnitChange: switchUnit } : {}

  const selector: SelectorPart = pumpMode && weight != null
    ? {
        value: pumpText,
        onValueChange: value => {
          setPumpText(value)
          const perKg = volumeRateFromPump(Number(value), weight)
          setRate(value && perKg != null ? String(perKg) : "")
        },
        min: 0,
        max: Math.round(surface.max * weight * 10) / 10,
        step: 0.1,
        quickValues: undefined,
        unitSuffix: PUMP_UNIT,
        ...units,
      }
    : {
        value: rate,
        onValueChange: setRate,
        min: input.min,
        max: surface.max,
        step: input.step,
        quickValues: input.quickValues ? surface.quickValues : undefined,
        unitSuffix: unit,
        ...units,
      }

  return { selector, readout: readoutText || undefined, suggestedFor }
}
