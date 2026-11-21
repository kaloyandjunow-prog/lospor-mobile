import { useEffect, useRef } from "react"
import { ScrollView, Text, TouchableOpacity, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native"
import { useShade } from "@/theme/colors"

/**
 * One looping wheel column (10.8.0), the same as the web's: values repeat
 * above and below so the end leads back to the start; it snaps, and the
 * centred value is the chosen one. Each row is a 44 px target.
 */
const ITEM = 44
const REPEATS = 5

export function WheelColumn({ values, value, onChange, format, label, testID }: {
  values: number[]
  value: number
  onChange: (value: number) => void
  format?: (value: number) => string
  label: string
  testID?: string
}) {
  const shade = useShade()
  const ref = useRef<ScrollViewInstance | null>(null)
  const count = values.length
  const middle = Math.floor(REPEATS / 2) * count
  const index = Math.max(0, values.indexOf(value))

  useEffect(() => {
    const timer = setTimeout(() => ref.current?.scrollTo({ y: (middle + index) * ITEM, animated: false }), 0)
    return () => clearTimeout(timer)
  }, [index, middle])

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const position = Math.round(event.nativeEvent.contentOffset.y / ITEM)
    const next = values[((position % count) + count) % count]
    ref.current?.scrollTo({ y: (middle + values.indexOf(next)) * ITEM, animated: false })
    if (next !== value) onChange(next)
  }

  return (
    <View style={{ height: ITEM * 5, width: 76 }} accessibilityLabel={label} testID={testID}>
      <View pointerEvents="none" style={{ position: "absolute", left: 4, right: 4, top: ITEM * 2, height: ITEM, borderRadius: 10, borderWidth: 1, borderColor: shade("#334155"), backgroundColor: shade("#ffffff10") }} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        onMomentumScrollEnd={settle}
        onScrollEndDrag={event => { if (!event.nativeEvent.velocity?.y) settle(event) }}
        contentContainerStyle={{ paddingVertical: ITEM * 2 }}
      >
        {Array.from({ length: REPEATS * count }, (_, i) => values[i % count]).map((item, i) => (
          <TouchableOpacity key={i} onPress={() => onChange(item)} style={{ height: ITEM, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 20, fontVariant: ["tabular-nums"], fontWeight: item === value ? "800" : "500", color: item === value ? shade("#f8fafc") : shade("#64748b") }}>
              {format ? format(item) : item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)
const two = (value: number) => String(value).padStart(2, "0")

/** The one time entry of the PWA (10.8.0): hours 00-23 and minutes 00-59, looping. */
export function TimeWheel({ hour, minute, onChange, labels }: {
  hour: number
  minute: number
  onChange: (value: { hour: number; minute: number }) => void
  labels: { hours: string; minutes: string }
}) {
  const shade = useShade()
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
      <WheelColumn values={HOURS} value={hour} format={two} label={labels.hours} testID="time-wheel-hours" onChange={next => onChange({ hour: next, minute })} />
      <Text style={{ color: shade("#94a3b8"), fontSize: 24, fontWeight: "800" }}>:</Text>
      <WheelColumn values={MINUTES} value={minute} format={two} label={labels.minutes} testID="time-wheel-minutes" onChange={next => onChange({ hour, minute: next })} />
    </View>
  )
}
