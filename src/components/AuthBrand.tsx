import { StyleSheet, Text, View } from "react-native"
import Svg, { Defs, Ellipse, LinearGradient, Path, Rect, Stop } from "react-native-svg"

const INK = "#f7f8f5"
const AMBER = "#f6ad2f"

export function AuthBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMin slice">
        <Defs>
          <LinearGradient id="auth-light" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={AMBER} stopOpacity={0.16} />
            <Stop offset="0.42" stopColor={AMBER} stopOpacity={0.035} />
            <Stop offset="1" stopColor={AMBER} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d="M145 0h100l78 520H67z" fill="url(#auth-light)" />
      </Svg>
    </View>
  )
}

export function AuthBrand() {
  return (
    <View style={styles.wrap} accessibilityRole="image" accessibilityLabel="LOSPOR">
      <Svg width={132} height={108} viewBox="0 0 240 196">
        <Path d="M120 8v22m-28 17c9-11 47-11 56 0" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
        <Path d="M66 70c0-27 24-44 54-44s54 17 54 44v18c0 12-24 22-54 22s-54-10-54-22z" fill="none" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
        <Ellipse cx={120} cy={88} rx={46} ry={16} fill={AMBER} />
        <Path d="M70 78c7-11 27-18 50-18s43 7 50 18" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
        <Rect x={75} y={126} width={90} height={56} rx={9} fill="none" stroke={INK} strokeWidth={5} />
        <Rect x={86} y={137} width={57} height={33} rx={3} fill="none" stroke={INK} strokeWidth={5} />
        <Path d="M68 188h104" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      </Svg>
      <Text style={styles.wordmark}>LOSPOR</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  wordmark: {
    color: INK,
    fontFamily: "Roboto_700Bold",
    fontSize: 32,
    letterSpacing: 0,
    marginTop: -2,
  },
})
