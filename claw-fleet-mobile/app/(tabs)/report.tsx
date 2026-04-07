import { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { Text, useTheme } from "react-native-paper";
import Markdown from "react-native-markdown-display";
import { useConnectionStore } from "../../src/stores/connection";
import { useT } from "../../src/i18n";
import type { DailyReport } from "../../src/types";

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export default function ReportScreen() {
  const theme = useTheme();
  const client = useConnectionStore((s) => s.client);
  const t = useT();
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return formatDate(yesterday);
  });

  const fetchReport = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      let r = await client.getDailyReport(date);
      if (!r) {
        r = await client.generateDailyReport(date);
      }
      setReport(r);
    } catch {
      setReport(null);
    }
    setLoading(false);
  }, [client, date]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const navigateDate = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(formatDate(d));
  };

  const bg = theme.colors.background;
  const cardBg = theme.colors.surface;
  const textColor = theme.colors.onSurface;
  const dimColor = theme.colors.onSurfaceVariant;
  const accentColor = theme.colors.primary;

  return (
    <ScrollView style={[styles.container, { backgroundColor: bg }]}>
      {/* Date navigator */}
      <View style={[styles.dateNav, { backgroundColor: cardBg }]}>
        <TouchableOpacity onPress={() => navigateDate(-1)}>
          <Text style={[styles.dateArrow, { color: accentColor }]}>&lt;</Text>
        </TouchableOpacity>
        <Text style={[styles.dateText, { color: textColor }]}>{date}</Text>
        <TouchableOpacity onPress={() => navigateDate(1)}>
          <Text style={[styles.dateArrow, { color: accentColor }]}>&gt;</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <ActivityIndicator
          size="large"
          color={accentColor}
          style={{ marginTop: 40 }}
        />
      )}

      {!loading && !report && (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: dimColor }]}>
            {t("report.no_data")}
          </Text>
        </View>
      )}

      {!loading && report && (
        <>
          {/* Metrics cards */}
          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, { backgroundColor: cardBg }]}>
              <Text style={[styles.metricValue, { color: textColor }]}>
                {report.metrics.totalSessions}
              </Text>
              <Text style={[styles.metricLabel, { color: dimColor }]}>
                {t("report.sessions")}
              </Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: cardBg }]}>
              <Text style={[styles.metricValue, { color: textColor }]}>
                {formatTokens(
                  report.metrics.totalInputTokens +
                    report.metrics.totalOutputTokens,
                )}
              </Text>
              <Text style={[styles.metricLabel, { color: dimColor }]}>
                {t("report.tokens")}
              </Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: cardBg }]}>
              <Text style={[styles.metricValue, { color: textColor }]}>
                {report.metrics.totalToolCalls}
              </Text>
              <Text style={[styles.metricLabel, { color: dimColor }]}>
                {t("report.tool_calls")}
              </Text>
            </View>
          </View>

          {/* Projects */}
          <View style={[styles.section, { backgroundColor: cardBg }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              {t("report.projects")}
            </Text>
            {report.metrics.projects.map((p) => (
              <View key={p.workspacePath} style={styles.projectRow}>
                <Text
                  style={[styles.projectName, { color: textColor }]}
                  numberOfLines={1}
                >
                  {p.workspaceName}
                </Text>
                <Text style={[styles.projectMeta, { color: dimColor }]}>
                  {p.sessionCount} sessions ·{" "}
                  {formatTokens(p.totalOutputTokens)} tokens
                </Text>
              </View>
            ))}
          </View>

          {/* AI Summary */}
          {report.aiSummary && (
            <View style={[styles.section, { backgroundColor: cardBg }]}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>
                {t("report.ai_summary")}
              </Text>
              <Markdown style={{
                body: { color: textColor, fontSize: 13, lineHeight: 20 },
                heading1: { fontSize: 16, fontWeight: "700" as const, color: textColor },
                heading2: { fontSize: 15, fontWeight: "700" as const, color: textColor },
                heading3: { fontSize: 14, fontWeight: "600" as const, color: textColor },
                strong: { fontWeight: "700" as const, color: textColor },
                link: { color: accentColor },
                code_inline: { backgroundColor: theme.colors.surfaceVariant, color: "#e879f9", fontSize: 12, fontFamily: "monospace" },
                fence: { backgroundColor: theme.colors.surfaceVariant, padding: 10, borderRadius: 8, fontSize: 12, fontFamily: "monospace", color: textColor },
                bullet_list: { marginVertical: 4 },
                list_item: { marginVertical: 1 },
                paragraph: { marginVertical: 3 },
              }}>
                {report.aiSummary}
              </Markdown>
            </View>
          )}

          {/* Lessons */}
          {report.lessons && report.lessons.length > 0 && (
            <View style={[styles.section, { backgroundColor: cardBg }]}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>
                {t("report.lessons")}
              </Text>
              {report.lessons.map((lesson, i) => (
                <View key={i} style={styles.lessonRow}>
                  <Text style={[styles.lessonContent, { color: textColor }]}>
                    {lesson.content}
                  </Text>
                  <Text style={[styles.lessonReason, { color: dimColor }]}>
                    {lesson.reason}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dateNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
  },
  dateArrow: { fontSize: 24, fontWeight: "bold", paddingHorizontal: 12 },
  dateText: { fontSize: 16, fontWeight: "600" },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  metricCard: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  metricValue: { fontSize: 22, fontWeight: "bold" },
  metricLabel: { fontSize: 11, marginTop: 4 },
  section: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 12 },
  projectRow: { marginBottom: 10 },
  projectName: { fontSize: 14, fontWeight: "500" },
  projectMeta: { fontSize: 12, marginTop: 2 },
  summaryText: { fontSize: 13, lineHeight: 20 },
  lessonRow: { marginBottom: 12 },
  lessonContent: { fontSize: 13, lineHeight: 19 },
  lessonReason: { fontSize: 11, marginTop: 4, fontStyle: "italic" },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontSize: 14 },
});
