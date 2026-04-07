import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { useSessionsStore, type SpeedSample } from "../stores/sessions";
import { brandColors } from "../theme";
import { useT } from "../i18n";

const CHART_WIDTH = 320;
const CHART_HEIGHT = 48;

function buildPath(samples: SpeedSample[], width: number, height: number): { line: string; area: string } {
  if (samples.length < 2) return { line: "", area: "" };

  const maxSpeed = Math.max(...samples.map((s) => s.speed), 1);
  const step = width / (samples.length - 1);

  const points = samples.map((s, i) => ({
    x: i * step,
    y: height - (s.speed / maxSpeed) * (height - 4) - 2,
  }));

  // Smooth curve using quadratic bezier
  let line = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    line += ` Q ${cpx} ${prev.y} ${curr.x} ${curr.y}`;
  }

  const lastPoint = points[points.length - 1];
  const area = `${line} L ${lastPoint.x} ${height} L ${points[0].x} ${height} Z`;

  return { line, area };
}

export function SpeedChart() {
  const theme = useTheme();
  const t = useT();
  const speedHistory = useSessionsStore((s) => s.speedHistory);
  const currentSpeed = speedHistory.length > 0
    ? speedHistory[speedHistory.length - 1].speed
    : 0;

  const { line, area } = useMemo(
    () => buildPath(speedHistory, CHART_WIDTH, CHART_HEIGHT),
    [speedHistory],
  );

  if (speedHistory.length < 2) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.outline }]}>
      <View style={styles.header}>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {t("speed_chart.title")}
        </Text>
        <Text variant="labelMedium" style={{ fontFamily: "monospace", fontWeight: "700", color: brandColors.success }}>
          {currentSpeed < 0.1 ? "-" : `${Math.round(currentSpeed)} t/s`}
        </Text>
      </View>
      <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={brandColors.success} stopOpacity="0.3" />
            <Stop offset="1" stopColor={brandColors.success} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {area && <Path d={area} fill="url(#grad)" />}
        {line && <Path d={line} stroke={brandColors.success} strokeWidth="2" fill="none" />}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    paddingTop: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 4,
  },
});
