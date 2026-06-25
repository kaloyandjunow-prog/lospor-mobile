import { View, Text, ScrollView, TouchableOpacity } from "react-native"

type MonitoringOpt = { label: string; field: string; section: string }

export function MonitoringTab({
  monitoring, setMonitoring, saveMonitoring, fieldSaving, monitoringOpts, advMonOpen, setAdvMonOpen,
}: {
  monitoring: string[]
  setMonitoring: (next: string[]) => void
  saveMonitoring: (next: string[]) => void
  fieldSaving: string | null
  monitoringOpts: MonitoringOpt[]
  advMonOpen: boolean
  setAdvMonOpen: (updater: (v: boolean) => boolean) => void
}) {
  return (
    <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
      {/* Standard monitoring — always visible */}
      <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:8 }}>
        Standard {fieldSaving === "monitoring" ? "(saving…)" : ""}
      </Text>
      <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:20 }}>
        {monitoringOpts.filter(o => o.section === "standard").map(opt => {
          const sel = monitoring.includes(opt.label)
          return (
            <TouchableOpacity key={opt.field} onPress={() => {
              const next = sel ? monitoring.filter(x => x !== opt.label) : [...monitoring, opt.label]
              setMonitoring(next)
              saveMonitoring(next)
            }} style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
              backgroundColor: sel ? "#0f2a1a" : "#111111",
              borderWidth:1, borderColor: sel ? "#22c55e" : "#1e2d40" }}>
              <Text style={{ color: sel ? "#86efac" : "#64748b", fontSize:12, fontWeight:"700" }}>{opt.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Advanced monitoring — collapsible */}
      {(() => {
        const advOpts = monitoringOpts.filter(o => o.section !== "standard")
        const advCount = advOpts.filter(o => monitoring.includes(o.label)).length
        return (
          <>
            <TouchableOpacity onPress={() => setAdvMonOpen(v => !v)}
              style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
                marginBottom: advMonOpen ? 12 : 0 }}>
              <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2, textTransform:"uppercase" }}>
                Advanced {advCount > 0 ? `(${advCount})` : ""}
              </Text>
              <Text style={{ color:"#475569", fontSize:11, fontWeight:"700" }}>{advMonOpen ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {advMonOpen && [
              { key:"respiratory",  label:"Respiratory" },
              { key:"haemodynamic", label:"Haemodynamic" },
              { key:"depth",        label:"Depth / Neuro" },
              { key:"other",        label:"Other" },
            ].map(sec => {
              const opts = advOpts.filter(o => o.section === sec.key)
              if (!opts.length) return null
              return (
                <View key={sec.key} style={{ marginBottom:16 }}>
                  <Text style={{ color:"#475569", fontSize:9, fontWeight:"700", letterSpacing:1, textTransform:"uppercase",
                    marginBottom:8, paddingLeft:4, borderLeftWidth:2, borderLeftColor:"#1e3a5f" }}>
                    {sec.label}
                  </Text>
                  <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                    {opts.map(opt => {
                      const sel = monitoring.includes(opt.label)
                      return (
                        <TouchableOpacity key={opt.field} onPress={() => {
                          const next = sel ? monitoring.filter(x => x !== opt.label) : [...monitoring, opt.label]
                          setMonitoring(next)
                          saveMonitoring(next)
                        }} style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:10,
                          backgroundColor: sel ? "#0f2a1a" : "#111111",
                          borderWidth:1, borderColor: sel ? "#22c55e" : "#1e2d40" }}>
                          <Text style={{ color: sel ? "#86efac" : "#64748b", fontSize:11, fontWeight:"700" }}>{opt.label}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              )
            })}
          </>
        )
      })()}

    </ScrollView>
  )
}
