import { Text, TouchableOpacity, View } from "react-native"
import { Sheet } from "./Sheet"

export type AirwayDetail = {
  tubeSize: string
  cuffed: "yes" | "no" | ""
  tool: string
  cl: string
}

type Props = {
  visible: boolean
  label: string
  detail: AirwayDetail
  onClose: () => void
  onDetailChange: (updater: (detail: AirwayDetail) => AirwayDetail) => void
  onConfirm: () => void
}

export function AirwayDetailSheet({ visible, label, detail, onClose, onDetailChange, onConfirm }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title={label} full>
      {label === "Intubated" ? (
        <View style={{ gap:16 }}>
          <View>
            <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
              letterSpacing:1, marginBottom:8 }}>Tube size (mm ID)</Text>
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
              {["6.0","6.5","7.0","7.5","8.0","8.5"].map(s => (
                <TouchableOpacity key={s} onPress={() => onDetailChange(d => ({ ...d, tubeSize:s }))}
                  style={{ paddingHorizontal:18, paddingVertical:12, borderRadius:10,
                    backgroundColor: detail.tubeSize===s ? "#6366f1" : "#6366f11a",
                    borderWidth:1, borderColor:"#6366f155" }}>
                  <Text style={{ color: detail.tubeSize===s ? "#fff" : "#a5b4fc",
                    fontWeight:"700", fontSize:16 }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View>
            <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
              letterSpacing:1, marginBottom:8 }}>Cuff</Text>
            <View style={{ flexDirection:"row", gap:10 }}>
              {["yes","no"].map(v => (
                <TouchableOpacity key={v} onPress={() => onDetailChange(d => ({ ...d, cuffed: v as "yes" | "no" }))}
                  style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                    backgroundColor: detail.cuffed===v ? "#6366f1" : "#6366f11a",
                    borderWidth:1, borderColor:"#6366f155" }}>
                  <Text style={{ color: detail.cuffed===v ? "#fff" : "#a5b4fc", fontWeight:"700" }}>
                    {v === "yes" ? "Cuffed" : "Uncuffed"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View>
            <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
              letterSpacing:1, marginBottom:8 }}>Laryngoscope</Text>
            <View style={{ flexDirection:"row", gap:8 }}>
              {["Direct","Video","FOB"].map(t => (
                <TouchableOpacity key={t} onPress={() => onDetailChange(d => ({ ...d, tool:t }))}
                  style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                    backgroundColor: detail.tool===t ? "#6366f1" : "#6366f11a",
                    borderWidth:1, borderColor:"#6366f155" }}>
                  <Text style={{ color: detail.tool===t ? "#fff" : "#a5b4fc",
                    fontWeight:"700", fontSize:13 }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View>
            <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
              letterSpacing:1, marginBottom:8 }}>Cormack-Lehane</Text>
            <View style={{ flexDirection:"row", gap:8 }}>
              {["I","IIa","IIb","III","IV"].map(g => (
                <TouchableOpacity key={g} onPress={() => onDetailChange(d => ({ ...d, cl:g }))}
                  style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                    backgroundColor: detail.cl===g ? "#6366f1" : "#6366f11a",
                    borderWidth:1, borderColor:"#6366f155" }}>
                  <Text style={{ color: detail.cl===g ? "#fff" : "#a5b4fc",
                    fontWeight:"700", fontSize:13 }}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      ) : (
        <View style={{ gap:14 }}>
          <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", textTransform:"uppercase",
            letterSpacing:1, marginBottom:4 }}>LMA size</Text>
          <View style={{ flexDirection:"row", gap:8 }}>
            {["1","1.5","2","2.5","3","4","5"].map(s => (
              <TouchableOpacity key={s} onPress={() => onDetailChange(d => ({ ...d, tubeSize:s }))}
                style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                  backgroundColor: detail.tubeSize===s ? "#6366f1" : "#6366f11a",
                  borderWidth:1, borderColor:"#6366f155" }}>
                <Text style={{ color: detail.tubeSize===s ? "#fff" : "#a5b4fc",
                  fontWeight:"700" }}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      <TouchableOpacity onPress={onConfirm}
        style={{ backgroundColor:"#6366f1", borderRadius:12, padding:16, alignItems:"center", marginTop:20 }}>
        <Text style={{ color:"#fff", fontWeight:"700", fontSize:15 }}>Log {label}</Text>
      </TouchableOpacity>
    </Sheet>
  )
}
