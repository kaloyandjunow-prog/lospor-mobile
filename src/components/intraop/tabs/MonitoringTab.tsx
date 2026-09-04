import { View, Text, ScrollView, TouchableOpacity } from "react-native"
import {
  cvpDisplayRange,
  cvpStep,
  cvpToCanonical,
  cvpToDisplay,
  MONITORING_VALUE_FIELDS,
} from "@lospor/core/monitoring-values"
import { ClinicalNumberInput } from "@/components/ClinicalNumberInput"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"

type MonitoringOpt = { label: string; field: string; section: string }

export type MonitoringValues = {
  bisValue: number | null
  tofRatio: number | null
  /** Always mmHg. The entry control converts if the clinician works in cmH2O. */
  cvpMmHg: number | null
}

export function MonitoringTab({
  monitoring, setMonitoring, saveMonitoring, fieldSaving, monitoringOpts, advMonOpen, setAdvMonOpen,
  values, saveValues,
}: {
  monitoring: string[]
  setMonitoring: (next: string[]) => void
  saveMonitoring: (next: string[]) => void
  fieldSaving: string | null
  monitoringOpts: MonitoringOpt[]
  advMonOpen: boolean
  setAdvMonOpen: (updater: (v: boolean) => boolean) => void
  values: MonitoringValues
  saveValues: (patch: Partial<MonitoringValues>) => void
}) {
  const { language, tc, cvpUnit } = usePreferences()
  const cvpRange = cvpDisplayRange(cvpUnit)

  /**
   * Turning a monitor off takes its reading with it.
   *
   * The server enforces this too, and that copy is the one that matters -- a
   * reading from a monitor the record says was not used must never reach the
   * database. This one keeps the number off the screen in the meantime.
   */
  function toggle(field: string) {
    const sel = monitoring.includes(field)
    const next = sel ? monitoring.filter(x => x !== field) : [...monitoring, field]
    setMonitoring(next)
    saveMonitoring(next)
    if (sel) {
      const bound = MONITORING_VALUE_FIELDS.find(f => f.flag === field)
      if (bound) saveValues({ [bound.value]: null })
    }
  }

  return (
    <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
      {/* Standard monitoring — always visible */}
      <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:8 }}>
        {displayClinicalCode("optionGroup", "standard", language)} {fieldSaving === "monitoring" ? `(${tc("draftSaving")})` : ""}
      </Text>
      <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:20 }}>
        {monitoringOpts.filter(o => o.section === "standard").map(opt => {
          const sel = monitoring.includes(opt.field)
          return (
            <TouchableOpacity key={opt.field} onPress={() => {
              const next = sel ? monitoring.filter(x => x !== opt.field) : [...monitoring, opt.field]
              setMonitoring(next)
              saveMonitoring(next)
            }} style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
              backgroundColor: sel ? "#0f2a1a" : "#111111",
              borderWidth:1, borderColor: sel ? "#22c55e" : "#1e2d40" }}>
              <Text style={{ color: sel ? "#86efac" : "#64748b", fontSize:12, fontWeight:"700" }}>
                {displayClinicalCode("option:MONITORING", opt.field, language, { label: opt.label })}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Advanced monitoring — collapsible */}
      {(() => {
        const advOpts = monitoringOpts.filter(o => o.section !== "standard")
        const advCount = advOpts.filter(o => monitoring.includes(o.field)).length
        return (
          <>
            <TouchableOpacity onPress={() => setAdvMonOpen(v => !v)}
              style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
                marginBottom: advMonOpen ? 12 : 0 }}>
              <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2, textTransform:"uppercase" }}>
                {displayClinicalCode("optionGroup", "advanced", language)} {advCount > 0 ? `(${advCount})` : ""}
              </Text>
              <Text style={{ color:"#475569", fontSize:11, fontWeight:"700" }}>{advMonOpen ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {advMonOpen && [
              { key:"respiratory",  label:tc("monitorRespiratory") },
              { key:"haemodynamic", label:tc("monitorHaemodynamic") },
              { key:"depth",        label:tc("monitorDepthNeuro") },
              { key:"other",        label:tc("monitorOther") },
            ].map(sec => {
              const opts = advOpts.filter(o => o.section === sec.key)
              if (!opts.length) return null
              return (
                <View key={sec.key} style={{ marginBottom:16 }}>
                  <Text style={{ color:"#475569", fontSize:9, fontWeight:"700", letterSpacing:1, textTransform:"uppercase",
                    marginBottom:8, paddingLeft:4, borderLeftWidth:2, borderLeftColor:"#1e3a5f" }}>
                    {displayClinicalCode("optionGroup", sec.key, language, { label: sec.label })}
                  </Text>
                  <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                    {opts.map(opt => {
                      const sel = monitoring.includes(opt.field)
                      return (
                        <TouchableOpacity key={opt.field} onPress={() => toggle(opt.field)}
                          style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:10,
                          backgroundColor: sel ? "#0f2a1a" : "#111111",
                          borderWidth:1, borderColor: sel ? "#22c55e" : "#1e2d40" }}>
                          <Text style={{ color: sel ? "#86efac" : "#64748b", fontSize:11, fontWeight:"700" }}>
                            {displayClinicalCode("option:MONITORING", opt.field, language, { label: opt.label })}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                  {/* The values belonging to monitors in this group, each shown
                      only while its own monitor is selected. The number sits
                      with the monitor rather than in a block of its own. */}
                  {sec.key === "haemodynamic" && monitoring.includes("cvpMonitor") && (
                    <View style={{ marginTop:12 }}>
                      {/* The unit is rendered by the input itself, so the
                          label does not repeat it. */}
                      <Text style={{ color:"#64748b", fontSize:11, fontWeight:"700", marginBottom:6 }}>CVP</Text>
                      <ClinicalNumberInput
                        value={values.cvpMmHg == null ? null : cvpToDisplay(values.cvpMmHg, cvpUnit)}
                        // Emptied is "not recorded", never 0 -- the stepper
                        // hands back undefined, coalesced so the clear reaches
                        // the server instead of dropping out of the patch.
                        onChange={value => saveValues({
                          cvpMmHg: value == null ? null : cvpToCanonical(value, cvpUnit),
                        })}
                        unit={cvpUnit === "cmH2O" ? "cmH₂O" : "mmHg"}
                        min={cvpRange.min}
                        max={cvpRange.max}
                        step={cvpStep(
                          values.cvpMmHg == null ? 0 : cvpToDisplay(values.cvpMmHg, cvpUnit),
                          cvpUnit,
                        )}
                      />
                    </View>
                  )}
                  {sec.key === "depth" && monitoring.includes("bis") && (
                    <View style={{ marginTop:12 }}>
                      <Text style={{ color:"#64748b", fontSize:11, fontWeight:"700", marginBottom:6 }}>BIS</Text>
                      <ClinicalNumberInput
                        value={values.bisValue}
                        onChange={value => saveValues({ bisValue: value ?? null })}
                        min={0} max={100} step={1}
                        quickValues={[40, 50, 60]}
                      />
                    </View>
                  )}
                  {sec.key === "depth" && monitoring.includes("tofMonitor") && (
                    <View style={{ marginTop:12 }}>
                      <Text style={{ color:"#64748b", fontSize:11, fontWeight:"700", marginBottom:6 }}>
                        {tc("tofRatioLabel")}
                      </Text>
                      <ClinicalNumberInput
                        value={values.tofRatio}
                        onChange={value => saveValues({ tofRatio: value ?? null })}
                        min={0} max={1} step={0.1}
                        quickValues={[0.4, 0.7, 0.9]}
                      />
                    </View>
                  )}
                </View>
              )
            })}
          </>
        )
      })()}

    </ScrollView>
  )
}
