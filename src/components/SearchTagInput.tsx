import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { apiJson } from "@/lib/api"
import { usePreferences } from "@/lib/preferences-context"
import { Chip } from "@/components/ui"
import { colors, withAlpha } from "@/theme/colors"

export type TagItem = { code: string; label: string; sub?: string; system?: string; labelEn?: string; labelBg?: string; inn?: string; atcCode?: string }
type SearchResult = {
  code?: string
  description?: string
  descriptionBg?: string
  group?: string
  domain?: string
  system?: string
  inn?: string
  atcCode?: string
  name?: string
  term?: string
}

type Props = {
  label: string
  value: TagItem[]
  onChange: (v: TagItem[]) => void
  endpoint: string
  queryParam?: string
  extraParams?: Record<string, string>
  placeholder?: string
  maxItems?: number
  onFocus?: () => void
}

export function SearchTagInput({
  label,
  value,
  onChange,
  endpoint,
  queryParam = "q",
  extraParams = {},
  placeholder = "Search...",
  maxItems,
  onFocus,
}: Props) {
  const { language, t } = usePreferences()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<TagItem[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const mergedParams: Record<string, string> = { [queryParam]: q, ...extraParams }
        if (endpoint.includes("icd11") || endpoint.includes("icd10")) mergedParams.locale = language
        const params = new URLSearchParams(mergedParams)
        const data = await apiJson<SearchResult[]>(`${endpoint}?${params}`)
        setResults(
          data.map((d) => {
            // ICD diagnosis / comorbidity result — format matches web: "K37 — Unspecified appendicitis"
            if (d.code && d.description && !d.group && !d.domain) {
              const displayLabel = (language === "bg" && d.descriptionBg) ? d.descriptionBg : d.description
              return {
                code: d.code,
                label: displayLabel,
                sub: d.code,
                system: d.system ?? "ICD-10",
                labelEn: d.description,
                labelBg: d.descriptionBg,
              }
            }
            // Procedure result (group + domain) or drug / fallback
            return {
              code: d.code ?? d.inn ?? d.name ?? d.term ?? "",
              label: d.group ?? d.description ?? d.name ?? d.term ?? d.code ?? "",
              sub: d.domain ? `${d.code ?? ""}${d.code ? " · " : ""}${d.domain}` : undefined,
              inn: d.inn ?? undefined,
              atcCode: d.atcCode ?? undefined,
            }
          })
        )
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [endpoint, queryParam, extraParams, language])

  function handleChange(q: string) {
    setQuery(q)
    setOpen(true)
    search(q)
  }

  function addItem(item: TagItem) {
    if (value.some((v) => (v.code || v.label) === (item.code || item.label))) return
    if (maxItems && value.length >= maxItems) return
    onChange([...value, item])
    setQuery("")
    setResults([])
    if (maxItems && value.length + 1 >= maxItems) setOpen(false)
  }

  function closeSearch() {
    setOpen(false)
    setQuery("")
    setResults([])
    setLoading(false)
  }

  function removeItem(code: string) {
    onChange(value.filter((v) => (v.code || v.label) !== code))
  }

  const canAdd = !maxItems || value.length < maxItems
  const visibleResults = results.slice(0, 12)

  return (
    <View style={{ marginBottom: 16, zIndex: open ? 20 : 1 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>{label}</Text>

      {value.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
          {value.map((item, idx) => (
            <Chip key={`${item.code || item.label}-${idx}`} label={item.label} onRemove={() => removeItem(item.code || item.label)} />
          ))}
        </View>
      ) : null}

      {canAdd ? (
        <View>
          <View
            style={{
              minHeight: 50,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: open ? withAlpha(colors.primary, "88") : colors.border,
              borderRadius: 14,
              borderCurve: "continuous",
              paddingHorizontal: 14,
            }}
          >
            <TextInput
              style={{ flex: 1, color: colors.textPrimary, fontSize: 16, paddingVertical: 12 }}
              placeholderTextColor={colors.textMuted}
              placeholder={value.length === 0 ? placeholder : t("addMore")}
              value={query}
              onFocus={() => { setOpen(true); onFocus?.() }}
              onChangeText={handleChange}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {open || query.length > 0 ? (
              <TouchableOpacity onPress={closeSearch} style={{ paddingHorizontal: 4, paddingVertical: 6 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "900" }}>{t("done")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {open ? (
            <View
              style={{
                marginTop: 8,
                maxHeight: 280,
                backgroundColor: colors.surfaceRaised,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 16,
                borderCurve: "continuous",
                overflow: "hidden",
                boxShadow: "0 16px 34px rgba(0,0,0,0.30)",
              }}
            >
              {loading ? (
                <View style={{ alignItems: "center", paddingVertical: 22 }}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : null}

              {!loading && query.length < 2 ? (
                <View style={{ padding: 14 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "800" }}>{t("typeAtLeast2")}</Text>
                </View>
              ) : null}

              {!loading && query.length >= 2 && visibleResults.length === 0 ? (
                <View style={{ padding: 14 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "800" }}>{t("noResultsFor")} "{query}"</Text>
                </View>
              ) : null}

              {visibleResults.length > 0 ? (
                <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {visibleResults.map((item, idx) => {
                    const selected = value.some((v) => (v.code || v.label) === (item.code || item.label))
                    return (
                      <TouchableOpacity
                        key={`${item.code || item.label}-${idx}`}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          borderBottomWidth: idx < visibleResults.length - 1 ? 1 : 0,
                          borderBottomColor: colors.border,
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          opacity: selected ? 0.4 : 1,
                        }}
                        onPress={() => !selected && addItem(item)}
                        disabled={selected}
                      >
                        <View style={{ flex: 1, marginRight: 12 }}>
                          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800" }}>{item.label}</Text>
                          {item.sub || (item.code && item.code !== item.label) ? (
                            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{item.sub ?? item.code}</Text>
                          ) : null}
                        </View>
                        {selected ? <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900" }}>{t("addedLabel")}</Text> : null}
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
