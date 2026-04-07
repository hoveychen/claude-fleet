import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Text, useTheme } from "react-native-paper";
import { useConnectionStore } from "../../src/stores/connection";
import { useT } from "../../src/i18n";
import type { AuditEvent, AuditRiskLevel, AuditSummary } from "../../src/types";

const RISK_COLORS: Record<AuditRiskLevel, string> = {
  critical: "#ef4444",
  high: "#eab308",
  medium: "#06b6d4",
};

type RiskFilter = "all" | AuditRiskLevel;

export default function AuditScreen() {
  const theme = useTheme();
  const client = useConnectionStore((s) => s.client);
  const t = useT();
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [filter, setFilter] = useState<RiskFilter>("all");

  const fetchAudit = useCallback(async () => {
    if (!client) return;
    try {
      const data = await client.getAuditEvents();
      setAudit(data);
    } catch {
      // ignore
    }
  }, [client]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const filtered =
    audit?.events.filter(
      (e) => filter === "all" || e.riskLevel === filter,
    ) ?? [];

  const bg = theme.colors.background;
  const cardBg = theme.colors.surface;
  const textColor = theme.colors.onSurface;
  const dimColor = theme.colors.onSurfaceVariant;

  const renderItem = ({ item }: { item: AuditEvent }) => {
    const riskColor = RISK_COLORS[item.riskLevel];
    return (
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <View style={styles.cardHeader}>
          <View
            style={[styles.riskBadge, { backgroundColor: `${riskColor}20` }]}
          >
            <Text style={[styles.riskText, { color: riskColor }]}>
              {item.riskLevel.toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.timestamp, { color: dimColor }]}>
            {new Date(item.timestamp).toLocaleTimeString()}
          </Text>
        </View>
        <Text
          style={[styles.workspace, { color: textColor }]}
          numberOfLines={1}
        >
          {item.workspaceName}
        </Text>
        <Text
          style={[styles.command, { color: dimColor }]}
          numberOfLines={3}
        >
          {item.commandSummary}
        </Text>
        <View style={styles.tagsRow}>
          {item.riskTags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Filter bar */}
      <View style={[styles.filterBar, { backgroundColor: cardBg }]}>
        {(["all", "critical", "high", "medium"] as RiskFilter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterBtn,
              filter === f && {
                backgroundColor: theme.colors.primaryContainer,
              },
            ]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === f ? theme.colors.primary : dimColor },
              ]}
            >
              {t(`audit.${f}` as any)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item, i) =>
          `${item.sessionId}-${item.timestamp}-${i}`
        }
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={fetchAudit} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: dimColor }]}>
              {t("audit.no_events")}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterBar: {
    flexDirection: "row",
    padding: 8,
    gap: 6,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  filterText: { fontSize: 13, fontWeight: "500" },
  list: { padding: 12, gap: 10 },
  card: { borderRadius: 12, padding: 14 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  riskText: { fontSize: 10, fontWeight: "700" },
  timestamp: { fontSize: 11 },
  workspace: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  command: { fontSize: 12, fontFamily: "monospace", marginBottom: 8 },
  tagsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: {
    backgroundColor: "rgba(128,128,128,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: { fontSize: 10, color: "#888" },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontSize: 14 },
});
