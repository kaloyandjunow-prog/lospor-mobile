import { Text, View } from "react-native"
import { intraopAttentionText, type IntraopAttentionAction, type IntraopAttentionItem } from "@lospor/core/intraop-attention"

import type { LogEvent } from "@/lib/intraop-log-event"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"
import { AttentionAnswers } from "./AttentionAnswers"

export type IntraopAttentionView = {
  items: IntraopAttentionItem[]
  resolve: (key: string, action: IntraopAttentionAction) => Promise<void>
  /** Time of day in the case's own zone. */
  clockOf: (ts: string) => string
  labelOf: (event: LogEvent) => string
}

/**
 * The questions the timeline is waiting on, above the chart (9.13.0): a stop
 * entered ahead whose time has come, and on an ended case anything left after
 * the end -- which otherwise could only be answered at End case, so a case
 * ended automatically could never be finalised. Visible without opening a
 * row; a tired clinician should not have to hunt for it.
 */
export function IntraopAttentionBanner({ attention }: { attention: IntraopAttentionView }) {
  const shade = useShade()
  const { tc, language } = usePreferences()
  if (attention.items.length === 0) return null
  return (
    <View testID="intraop-attention" style={{
      marginHorizontal: 10, marginTop: 8, marginBottom: 4, padding: 10, borderRadius: 12,
      backgroundColor: shade("#fbbf24") + "14", borderWidth: 1, borderColor: shade("#fbbf24") + "66",
    }}>
      <Text style={{ color: shade("#fbbf24"), fontWeight: "800", fontSize: 13, marginBottom: 6 }}>
        {tc("attentionBannerTitle")}
      </Text>
      {attention.items.map(item => (
        <View key={item.key} style={{ marginBottom: 8 }}>
          <Text style={{ color: shade("#e2e8f0"), fontWeight: "700", fontSize: 13, marginBottom: 6 }}>
            {attention.clockOf(item.event.ts)} · {intraopAttentionText(item, language)}
            {item.kind === "unconfirmed_stop" ? ` — ${tc("stopUnconfirmedLabel")}` : ""}
          </Text>
          <AttentionAnswers id={item.key} kind={item.kind} onAnswer={(key, action) => { void attention.resolve(key, action) }} />
        </View>
      ))}
    </View>
  )
}
