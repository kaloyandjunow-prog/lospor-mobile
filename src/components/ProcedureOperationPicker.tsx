import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native"
import {
  exactProcedureTag,
  isExactProcedure,
  procedureGroupOf,
  procedureGroupTag,
} from "@lospor/core/procedure-codes"
import type { CanonicalSearchTag } from "@lospor/core/search"
import { apiJson } from "@/lib/api"
import { usePreferences } from "@/lib/preferences-context"
import { colors, withAlpha } from "@/theme/colors"

type ProcedureItem = CanonicalSearchTag & { source?: "manual" | "ai-scan" | "import" }
type CodeRow = { code: string; description: string; domain: string | null }
type CodeList = { total: number; codes: CodeRow[] }

type Props = {
  value: ProcedureItem[]
  onChange: (items: ProcedureItem[]) => void
}

/**
 * The optional second step of a planned procedure: the exact operation.
 *
 * Mirrors the web form's picker. A group holds several operations --
 * laparoscopic or open, whole or partial -- and only the one actually planned
 * is a research code, so each chosen group offers its ICD-10-PCS operations,
 * narrowed by typing. The list needs the network; offline the group is kept
 * and the operation can be chosen later.
 */
export function ProcedureOperationPicker({ value, onChange }: Props) {
  const { tc } = usePreferences()
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  if (!value.some(item => procedureGroupOf(item))) return null

  const replace = (index: number, next: ProcedureItem) =>
    onChange(value.map((item, i) => (i === index ? next : item)))

  return (
    <View style={{ marginTop: -8, marginBottom: 16, gap: 8 }}>
      {value.map((item, index) => {
        const group = procedureGroupOf(item)
        if (!group) return null
        const exact = isExactProcedure(item)
        const source = item.source ? { source: item.source } : {}
        return (
          <View
            key={`${item.code || item.label}-${index}`}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, borderCurve: "continuous", padding: 12, backgroundColor: colors.surface }}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800" }}>{group}</Text>
            <Text style={{ color: exact ? colors.textSecondary : colors.textMuted, fontSize: 13, marginTop: 2 }}>
              {exact ? `${item.code} · ${item.description ?? ""}` : tc("procedureNoExact")}
            </Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setOpenIndex(openIndex === index ? null : index)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "900" }}>
                  {exact ? tc("procedureChangeExact") : tc("procedureSpecifyExact")}
                </Text>
              </TouchableOpacity>
              {exact ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => {
                    replace(index, { ...procedureGroupTag({ group, domain: item.domain ?? "" }), ...source })
                    setOpenIndex(null)
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "800" }}>{tc("procedureGroupOnly")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {openIndex === index ? (
              <OperationList
                group={group}
                selected={exact ? item.code : null}
                onPick={row => {
                  replace(index, { ...exactProcedureTag({ ...row, group, domain: row.domain ?? "" }), ...source })
                  setOpenIndex(null)
                }}
              />
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

function OperationList({ group, selected, onPick }: {
  group: string
  selected: string | null
  onPick: (row: CodeRow) => void
}) {
  const { tc } = usePreferences()
  const [query, setQuery] = useState("")
  const [list, setList] = useState<CodeList | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ group, q: query })
        const body = await apiJson<CodeList>(`/api/search/procedures/codes?${params}`)
        if (!cancelled) { setList(body); setFailed(false) }
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, query ? 250 : 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [group, query])

  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={tc("procedureExactFilter")}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        style={{ color: colors.textPrimary, fontSize: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surfaceRaised }}
      />
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {failed ? (
        <Text style={{ color: colors.warning, fontSize: 12, fontWeight: "800", backgroundColor: withAlpha(colors.warning, "1A"), padding: 8, borderRadius: 8 }}>
          {tc("procedureExactUnavailable")}
        </Text>
      ) : null}
      {!loading && list && list.total === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{tc("procedureExactNone")}</Text>
      ) : null}
      {list && list.total > list.codes.length ? (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {tc("procedureExactMore").replace("{shown}", String(list.codes.length)).replace("{total}", String(list.total))}
        </Text>
      ) : null}
      {list && list.codes.length > 0 ? (
        <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {list.codes.map((row, idx) => (
            <TouchableOpacity
              key={row.code}
              accessibilityRole="button"
              accessibilityState={{ selected: row.code === selected }}
              onPress={() => onPick(row)}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 8,
                borderBottomWidth: idx < list.codes.length - 1 ? 1 : 0,
                borderBottomColor: colors.border,
                backgroundColor: row.code === selected ? colors.primarySoft : "transparent",
              }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{row.description}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{row.code}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </View>
  )
}
