import { useEffect, useState } from "react"
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from "react-native"
import { useRouter } from "expo-router"
import { apiFetch } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"

type CaseItem = {
  id: string
  caseCode: string
  status: "DRAFT" | "IN_PROGRESS" | "COMPLETE"
  createdAt: string
  preop?: { diagnosis?: string; plannedProcedure?: string; ageYears?: number; sex?: string; asaScore?: string }
  intraop?: { monthYear?: string }
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT:       "Draft",
  IN_PROGRESS: "In progress",
  COMPLETE:    "Complete",
}

const STATUS_COLOUR: Record<string, string> = {
  DRAFT:       "bg-slate-700 text-slate-300",
  IN_PROGRESS: "bg-blue-900 text-blue-300",
  COMPLETE:    "bg-green-900 text-green-300",
}

export default function DashboardScreen() {
  const router = useRouter()
  const { logout } = useAuth()
  const [cases, setCases]       = useState<CaseItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    try {
      const res = await apiFetch("/api/cases")
      if (res.ok) setCases(await res.json())
    } catch {
      Alert.alert("Error", "Could not load cases.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  function renderCase({ item }: { item: CaseItem }) {
    const label = item.preop?.plannedProcedure ?? item.preop?.diagnosis ?? "Unnamed case"
    const sub   = [
      item.preop?.ageYears ? `${item.preop.ageYears}y` : null,
      item.preop?.sex,
      item.preop?.asaScore ? `ASA ${item.preop.asaScore}` : null,
      item.intraop?.monthYear,
    ].filter(Boolean).join(" · ")

    return (
      <TouchableOpacity
        className="bg-slate-800 rounded-xl px-4 py-3.5 mb-3"
        onPress={() => router.push(`/(app)/cases/${item.id}`)}
      >
        <View className="flex-row justify-between items-start mb-1">
          <Text className="text-white font-semibold flex-1 mr-2" numberOfLines={2}>{label}</Text>
          <Text className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOUR[item.status]}`}>
            {STATUS_LABEL[item.status]}
          </Text>
        </View>
        <Text className="text-slate-400 text-xs">{item.caseCode}{sub ? `  ·  ${sub}` : ""}</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View className="flex-1 bg-slate-900">
      {/* Header */}
      <View className="flex-row justify-between items-center px-5 pt-14 pb-4">
        <Text className="text-white text-xl font-bold">My cases</Text>
        <View className="flex-row gap-4 items-center">
          <TouchableOpacity onPress={() => router.push("/(app)/settings")}>
            <Text className="text-slate-400 text-sm">Settings</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading
        ? <ActivityIndicator className="mt-20" color="#3b82f6" />
        : (
          <FlatList
            className="px-5"
            data={cases}
            keyExtractor={c => c.id}
            renderItem={renderCase}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#3b82f6" />}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListEmptyComponent={
              <View className="items-center mt-20">
                <Text className="text-slate-400 text-base">No cases yet</Text>
                <Text className="text-slate-600 text-sm mt-2">Tap + to create your first case</Text>
              </View>
            }
          />
        )
      }

      {/* FAB */}
      <TouchableOpacity
        className="absolute bottom-8 right-6 bg-blue-500 w-14 h-14 rounded-full items-center justify-center"
        onPress={() => router.push("/(app)/cases/new")}
      >
        <Text className="text-white text-3xl font-light" style={{ lineHeight: 36 }}>+</Text>
      </TouchableOpacity>
    </View>
  )
}
