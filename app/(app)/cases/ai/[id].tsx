import { useEffect, useState } from "react"
import {
  View, Text, ScrollView, Switch, ActivityIndicator, type TextStyle,
} from "react-native"
import { useLocalSearchParams, Stack } from "expo-router"
import { apiFetch, apiJson } from "@/lib/api"
import { SectionHeader, Card, PrimaryButton } from "@/components/ui"
import { colors } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedSection = { title: string; body: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSections(text: string): ParsedSection[] {
  const parts = text.split(/\n## /)
  return parts
    .map((p, i) => {
      const lines = p.split("\n")
      const title = i === 0 ? lines[0].replace(/^## /, "") : lines[0]
      const body = lines.slice(1).join("\n").trim()
      return { title, body }
    })
    .filter(s => s.title && s.body)
}

// ─── Lightweight Markdown renderer ───────────────────────────────────────────
// Handles the subset the AI uses: **bold**, *italic*, `code`, - bullets, numbered lists.
// React Native Text doesn't parse Markdown natively so we do it here.

function renderInline(text: string, baseStyle: TextStyle): React.ReactNode {
  // Split on **bold** and *italic* spans
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <Text key={i} style={{ ...baseStyle, fontWeight: "800", color: colors.textPrimary }}>{part.slice(2, -2)}</Text>
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <Text key={i} style={{ ...baseStyle, fontStyle: "italic" }}>{part.slice(1, -1)}</Text>
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <Text key={i} style={{ ...baseStyle, fontFamily: "monospace", color: colors.textSecondary }}>{part.slice(1, -1)}</Text>
    }
    return <Text key={i} style={baseStyle}>{part}</Text>
  })
}

function MarkdownBody({ text }: { text: string }) {
  const baseStyle: TextStyle = { color: colors.textSecondary, fontSize: 14, lineHeight: 21 }
  const lines = text.split("\n")

  return (
    <View style={{ gap: 3 }}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd()

        // Blank line → small spacer
        if (!line.trim()) return <View key={i} style={{ height: 4 }} />

        // Horizontal rule
        if (/^---+$/.test(line)) return <View key={i} style={{ height: 1, backgroundColor: colors.border, marginVertical: 6 }} />

        // Bullet point: - or * or •
        if (/^[-*•]\s+/.test(line)) {
          const content = line.replace(/^[-*•]\s+/, "")
          return (
            <View key={i} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ ...baseStyle, color: colors.textMuted, lineHeight: 21 }}>•</Text>
              <Text style={{ ...baseStyle, flex: 1 }}>{renderInline(content, baseStyle)}</Text>
            </View>
          )
        }

        // Numbered list: 1. or 1)
        const numMatch = line.match(/^(\d+)[.)]\s+(.*)/)
        if (numMatch) {
          return (
            <View key={i} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ ...baseStyle, color: colors.textMuted, minWidth: 18 }}>{numMatch[1]}.</Text>
              <Text style={{ ...baseStyle, flex: 1 }}>{renderInline(numMatch[2], baseStyle)}</Text>
            </View>
          )
        }

        // Sub-header (### or ####) — render as small bold label
        const hMatch = line.match(/^#{3,}\s+(.+)/)
        if (hMatch) {
          return <Text key={i} style={{ ...baseStyle, fontWeight: "800", color: colors.textPrimary, marginTop: 6 }}>{hMatch[1]}</Text>
        }

        // Regular paragraph line
        return <Text key={i} style={baseStyle}>{renderInline(line, baseStyle)}</Text>
      })}
    </View>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GdprCard({
  aiOptIn,
  onToggle,
  privacyNote,
  enableLabel,
}: {
  aiOptIn: boolean
  onToggle: (v: boolean) => void
  privacyNote: string
  enableLabel: string
}) {
  return (
    <Card className="border-l-4 border-amber-500 px-4 py-4 mb-4">
      <Text className="text-slate-300 text-sm leading-relaxed mb-4">
        {privacyNote}
      </Text>
      <View className="flex-row justify-between items-center">
        <Text className="text-slate-200 text-sm font-medium flex-1 mr-3">
          {enableLabel}
        </Text>
        <Switch
          value={aiOptIn}
          onValueChange={onToggle}
          trackColor={{ false: "#374151", true: "#7c3aed" }}
          thumbColor="#fff"
        />
      </View>
    </Card>
  )
}

function AnalysingState({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-3 py-6 justify-center">
      <ActivityIndicator color="#7c3aed" />
      <Text className="text-slate-400 text-sm italic">{label}</Text>
    </View>
  )
}

function ErrorCard({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <Card className="px-4 py-4 mb-4 border-red-800">
      <Text className="text-red-400 text-sm mb-4">{message}</Text>
      <PrimaryButton label="Retry" color="red" onPress={onRetry} />
    </Card>
  )
}

function SectionCard({ title, body }: ParsedSection) {
  return (
    <Card className="px-4 py-4 mb-3">
      <Text className="text-blue-400 font-semibold text-sm mb-3">{title}</Text>
      <MarkdownBody text={body} />
    </Card>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AIAdvisorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { tc } = usePreferences()

  const [caseData, setCaseData]       = useState<any>(null)
  const [loading, setLoading]         = useState(true)
  const [aiOptIn, setAiOptIn]         = useState(false)
  const [analysing, setAnalysing]     = useState(false)
  const [streamedText, setStreamedText] = useState("")
  const [error, setError]             = useState<string | null>(null)

  useEffect(() => {
    apiJson<any>(`/api/cases/${id}`)
      .then((data: any) => setCaseData(data?.preop ?? data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  async function runAnalysis() {
    if (!aiOptIn || !caseData) return
    setError(null)
    setStreamedText("")
    setAnalysing(true)

    try {
      const res = await apiFetch("/api/ai/advise", {
        method: "POST",
        body: JSON.stringify({ ...caseData, aiOptIn: true }),
      })

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(tc("aiRateLimit"))
        }
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? tc("aiRequestFailed"))
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response stream available.")

      const decoder = new TextDecoder()
      let text = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setStreamedText(text)
      }
    } catch (err: any) {
      setError(err.message ?? tc("aiRequestFailed"))
    } finally {
      setAnalysing(false)
    }
  }

  // ── Loading case data ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#7c3aed" />
      </View>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const sections = parseSections(streamedText)

  return (
    <>
      <Stack.Screen options={{ title: "AI Advisor" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 16 }}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <SectionHeader title={tc("aiPrivacySection")} />

        <GdprCard
          aiOptIn={aiOptIn}
          onToggle={setAiOptIn}
          privacyNote={tc("aiPrivacyNote")}
          enableLabel={tc("aiEnableLabel")}
        />

        <View className="mb-6">
          <PrimaryButton
            label={tc("aiAnalyseBtn")}
            color="violet"
            onPress={runAnalysis}
            disabled={!aiOptIn || analysing}
            loading={false}
          />
        </View>

        {analysing && <AnalysingState label={tc("aiAnalysing")} />}

        {error && !analysing && (
          <ErrorCard message={error} onRetry={runAnalysis} />
        )}

        {sections.length > 0 && (
          <>
            <SectionHeader title={tc("aiAnalysisSection")} />
            {sections.map((s, i) => (
              <SectionCard key={i} title={s.title} body={s.body} />
            ))}
          </>
        )}
      </ScrollView>
    </>
  )
}
