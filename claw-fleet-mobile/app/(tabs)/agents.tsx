import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  Pressable,
} from "react-native";
import {
  Card,
  Chip,
  Searchbar,
  SegmentedButtons,
  Text,
  useTheme,
} from "react-native-paper";
import { Icon } from "../../src/components/Icon";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useConnectionStore } from "../../src/stores/connection";
import { useSessionsStore } from "../../src/stores/sessions";
import { SpeedChart } from "../../src/components/SpeedChart";
import { statusColors, brandColors } from "../../src/theme";
import { useT } from "../../src/i18n";
import type { SessionInfo, SessionStatus } from "../../src/types";

// ── Constants ──────────────────────────────────────────────────────────────

const ACTIVE_STATUSES: SessionStatus[] = [
  "thinking", "executing", "streaming", "processing",
  "waitingInput", "active", "delegating",
];

const STATUS_ICONS: Record<SessionStatus, string> = {
  thinking: "bulb",
  streaming: "arrow-down-circle",
  executing: "play-circle",
  processing: "sync-circle",
  delegating: "git-network",
  waitingInput: "pause-circle",
  active: "radio-button-on",
  idle: "ellipse-outline",
};

const SUBAGENT_TYPE_ICONS: Record<string, string> = {
  explore: "search",
  plan: "clipboard",
  "general-purpose": "build",
  "claude-code-guide": "book",
};

const CHIP_HUES = [210, 160, 30, 350, 280, 55, 330, 120, 190, 90];

// ── Helpers ────────────────────────────────────────────────────────────────

function isActive(s: SessionInfo) {
  return ACTIVE_STATUSES.includes(s.status);
}

function chipHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CHIP_HUES[h % CHIP_HUES.length];
}

function formatSpeed(tps: number): string {
  if (tps < 0.1) return "";
  if (tps >= 1000) return `${(tps / 1000).toFixed(1)}k t/s`;
  return `${Math.round(tps)} t/s`;
}

function formatTokens(n: number): string {
  if (n === 0) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function formatModel(m: string | null): string {
  if (!m) return "";
  return m.replace("claude-", "").replace(/-20\d+$/, "");
}

function timeAgo(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function openSession(s: SessionInfo) {
  router.push({
    pathname: "/agent/[id]",
    params: { id: s.id, jsonlPath: s.jsonlPath },
  });
}

// ── Build tree ─────────────────────────────────────────────────────────────

interface TreeNode {
  main: SessionInfo;
  subagents: SessionInfo[];
}

function buildTree(sessions: SessionInfo[]): TreeNode[] {
  const mains = sessions.filter((s) => !s.isSubagent);
  const subByParent = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    if (s.isSubagent && s.parentSessionId) {
      const arr = subByParent.get(s.parentSessionId) ?? [];
      arr.push(s);
      subByParent.set(s.parentSessionId, arr);
    }
  }

  // Sort: active groups first
  const sorted = [...mains].sort((a, b) => {
    const aGroupActive = isActive(a) || (subByParent.get(a.id) ?? []).some(isActive);
    const bGroupActive = isActive(b) || (subByParent.get(b.id) ?? []).some(isActive);
    if (aGroupActive !== bGroupActive) return bGroupActive ? 1 : -1;
    return b.lastActivityMs - a.lastActivityMs;
  });

  return sorted.map((main) => ({
    main,
    subagents: subByParent.get(main.id) ?? [],
  }));
}

// ── Subagent Chip (Gallery mode) ───────────────────────────────────────────

function SubagentChip({ session, index }: { session: SessionInfo; index: number }) {
  const theme = useTheme();
  const active = isActive(session);
  const hue = chipHue(session.id);
  const color = statusColors[session.status] || "#6b7280";
  const typeIcon = SUBAGENT_TYPE_ICONS[session.agentType || ""] || "git-branch";

  return (
    <Pressable
      onPress={() => openSession(session)}
      style={[
        styles.chip,
        {
          backgroundColor: `hsla(${hue}, 40%, 20%, ${active ? 0.8 : 0.3})`,
          borderColor: `hsla(${hue}, 50%, 40%, ${active ? 0.6 : 0.2})`,
          opacity: active ? 1 : 0.6,
        },
      ]}
    >
      <View style={[styles.chipDot, { backgroundColor: color }]} />
      <Text style={styles.chipIndex}>#{index}</Text>
      <Icon name={typeIcon} size={11} color="#aaa" />
      {session.agentDescription ? (
        <Text style={styles.chipDesc} numberOfLines={1}>
          {session.agentDescription}
        </Text>
      ) : session.agentType ? (
        <Text style={styles.chipDesc}>{session.agentType}</Text>
      ) : null}
      {session.model && (
        <Text style={styles.chipModel}>{formatModel(session.model)}</Text>
      )}
      {session.tokenSpeed >= 0.5 && (
        <Text style={styles.chipSpeed}>{formatSpeed(session.tokenSpeed)}</Text>
      )}
    </Pressable>
  );
}

// ── Gallery Row (one workspace group) ──────────────────────────────────────

function GalleryRow({ node }: { node: TreeNode }) {
  const theme = useTheme();
  const t = useT();
  const [idleExpanded, setIdleExpanded] = useState(false);
  const { main, subagents } = node;

  const sortedSubs = [...subagents].sort((a, b) => a.jsonlPath.localeCompare(b.jsonlPath));
  const subIndexMap = new Map(sortedSubs.map((s, i) => [s.id, i + 1]));
  const activeSubs = subagents.filter(isActive);
  const idleSubs = subagents.filter((s) => !isActive(s));
  const groupActive = isActive(main) || activeSubs.length > 0;
  const totalSpeed = [main, ...subagents].reduce((sum, s) => sum + s.tokenSpeed, 0);
  const totalTokens = [main, ...subagents].reduce((sum, s) => sum + s.totalOutputTokens, 0);
  const color = statusColors[main.status] || "#6b7280";

  return (
    <Card
      style={[
        styles.galleryCard,
        {
          backgroundColor: theme.colors.surface,
          borderLeftWidth: 3,
          borderLeftColor: groupActive ? color : theme.colors.outline,
        },
      ]}
      mode="contained"
    >
      {/* Header: workspace name + status + stats */}
      <Pressable onPress={() => openSession(main)} style={styles.galleryHeader}>
        <View style={styles.galleryHeaderLeft}>
          <Text variant="titleSmall" style={{ fontWeight: "700" }} numberOfLines={1}>
            {main.workspaceName}
          </Text>
          <View style={styles.statusBadge}>
            <Icon name={STATUS_ICONS[main.status]} size={12} color={color} />
            <Text style={[styles.statusLabel, { color }]}>{main.status}</Text>
          </View>
        </View>
        <View style={styles.galleryStats}>
          {subagents.length > 0 && (
            <Text style={styles.galleryStat}>{subagents.length} {t("agents.subs")}</Text>
          )}
          <Text style={styles.galleryStat}>{formatTokens(totalTokens)} {t("agents.tok")}</Text>
          {totalSpeed >= 0.5 && (
            <Text style={[styles.galleryStat, { color: brandColors.success, fontWeight: "600" }]}>
              {formatSpeed(totalSpeed)}
            </Text>
          )}
        </View>
      </Pressable>

      {/* Main agent info */}
      <Pressable onPress={() => openSession(main)} style={styles.galleryBody}>
        <Text variant="bodyMedium" style={{ fontWeight: "600" }} numberOfLines={1}>
          {main.aiTitle || main.slug || main.workspaceName}
        </Text>
        {main.lastMessagePreview && (
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
            numberOfLines={2}
          >
            {main.lastMessagePreview}
          </Text>
        )}
        <View style={styles.metaRow}>
          <Icon name="terminal" size={11} color={theme.colors.onSurfaceVariant} />
          <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>
            {formatModel(main.model)} · {formatTokens(main.totalOutputTokens)} tok
            {main.contextPercent != null ? ` · ctx ${main.contextPercent}%` : ""}
          </Text>
        </View>
      </Pressable>

      {/* Active subagent chips */}
      {activeSubs.length > 0 && (
        <View style={styles.chipsRow}>
          {activeSubs.map((sub) => (
            <SubagentChip
              key={sub.id}
              session={sub}
              index={subIndexMap.get(sub.id) ?? 0}
            />
          ))}
        </View>
      )}

      {/* Idle subagents (collapsible) */}
      {idleSubs.length > 0 && (
        <View style={styles.idleSection}>
          <Pressable
            onPress={() => setIdleExpanded(!idleExpanded)}
            style={styles.idleToggle}
          >
            <Icon
              name={idleExpanded ? "chevron-up" : "chevron-down"}
              size={12}
              color={theme.colors.onSurfaceVariant}
            />
            <Text style={[styles.idleLabel, { color: theme.colors.onSurfaceVariant }]}>
              {idleSubs.length} {idleSubs.length > 1 ? t("agents.idle_subagents") : t("agents.idle_subagent")}
            </Text>
          </Pressable>
          {idleExpanded && (
            <View style={styles.chipsRow}>
              {idleSubs.map((sub) => (
                <SubagentChip
                  key={sub.id}
                  session={sub}
                  index={subIndexMap.get(sub.id) ?? 0}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

// ── List Row (indented tree) ───────────────────────────────────────────────

function ListRow({ session, indented }: { session: SessionInfo; indented: boolean }) {
  const theme = useTheme();
  const t = useT();
  const color = statusColors[session.status] || "#6b7280";
  const typeIcon = session.isSubagent
    ? SUBAGENT_TYPE_ICONS[session.agentType || ""] || "git-branch"
    : "terminal";

  const title = session.isSubagent
    ? session.agentDescription || session.agentType || session.workspaceName
    : session.aiTitle || session.slug || session.workspaceName;

  return (
    <Pressable
      onPress={() => openSession(session)}
      style={[
        styles.listRow,
        {
          backgroundColor: theme.colors.surface,
          marginLeft: indented ? 14 : 0,
          borderLeftWidth: indented ? 2 : 0,
          borderLeftColor: theme.colors.outline,
        },
      ]}
    >
      <View style={styles.listRowHeader}>
        <View style={styles.listRowLeft}>
          <View style={[styles.statusDotSmall, { backgroundColor: color }]} />
          <Icon name={typeIcon} size={13} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodyMedium" style={{ fontWeight: "600", flex: 1 }} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>
          {formatSpeed(session.tokenSpeed) || timeAgo(session.lastActivityMs)}
        </Text>
      </View>
      {!indented && session.lastMessagePreview && (
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
          numberOfLines={1}
        >
          {session.lastMessagePreview}
        </Text>
      )}
      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>
          {session.isSubagent ? `⎇ ${session.agentType || "sub"}` : `◈ ${t("agents.main")}`}
        </Text>
        <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>
          {formatModel(session.model)}
        </Text>
        <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>
          {formatTokens(session.totalOutputTokens)} {t("agents.tok")}
        </Text>
      </View>
    </Pressable>
  );
}

// ── Build flat list for list view ──────────────────────────────────────────

interface ListItem {
  session: SessionInfo;
  indented: boolean;
}

function buildFlatList(sessions: SessionInfo[]): ListItem[] {
  const tree = buildTree(sessions);
  const result: ListItem[] = [];
  for (const node of tree) {
    result.push({ session: node.main, indented: false });
    // Sort subagents: active first
    const sorted = [...node.subagents].sort((a, b) => {
      if (isActive(a) !== isActive(b)) return isActive(b) ? 1 : -1;
      return b.lastActivityMs - a.lastActivityMs;
    });
    for (const sub of sorted) {
      result.push({ session: sub, indented: true });
    }
  }
  return result;
}

// ── Screen ─────────────────────────────────────────────────────────────────

type ViewMode = "gallery" | "list";
type FilterMode = "active" | "all";

export default function AgentsScreen() {
  const theme = useTheme();
  const t = useT();
  const sessions = useSessionsStore((s) => s.sessions);
  const client = useConnectionStore((s) => s.client);
  const setSessions = useSessionsStore((s) => s.setSessions);
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [filter, setFilter] = useState<FilterMode>("active");
  const [search, setSearch] = useState("");

  const onRefresh = useCallback(async () => {
    if (!client) return;
    try { setSessions(await client.listSessions()); } catch {}
  }, [client, setSessions]);

  // Filter sessions
  const filtered = useMemo(() => {
    let list = [...sessions];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.workspaceName.toLowerCase().includes(q) ||
          s.aiTitle?.toLowerCase().includes(q) ||
          s.slug?.toLowerCase().includes(q) ||
          s.agentDescription?.toLowerCase().includes(q) ||
          s.id.startsWith(q),
      );
    }
    if (filter === "active") {
      // Keep session if it's active, or if it's a parent with active subagents
      const activeParentIds = new Set(
        list.filter((s) => s.isSubagent && isActive(s) && s.parentSessionId)
          .map((s) => s.parentSessionId!),
      );
      list = list.filter((s) => isActive(s) || activeParentIds.has(s.id));
    }
    return list;
  }, [sessions, filter, search]);

  // Gallery data
  const tree = useMemo(() => buildTree(filtered), [filtered]);

  // List data
  const flatList = useMemo(() => buildFlatList(filtered), [filtered]);

  const activeCount = sessions.filter((s) => isActive(s) && !s.isSubagent).length;
  const totalSpeed = sessions.reduce((sum, s) => sum + s.tokenSpeed, 0);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Summary bar */}
      <View style={[styles.summaryBar, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.outline }]}>
        <View style={styles.summaryItem}>
          <Text variant="headlineSmall" style={{ fontWeight: "800", color: brandColors.primary }}>
            {activeCount}
          </Text>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{t("agents.active")}</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: theme.colors.outline }]} />
        <View style={styles.summaryItem}>
          <Text variant="headlineSmall" style={{ fontWeight: "800" }}>
            {sessions.filter((s) => !s.isSubagent).length}
          </Text>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{t("agents.total")}</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: theme.colors.outline }]} />
        <View style={styles.summaryItem}>
          <Text variant="headlineSmall" style={{ fontWeight: "800", fontFamily: "monospace" }}>
            {formatSpeed(totalSpeed) || "-"}
          </Text>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{t("agents.speed")}</Text>
        </View>
      </View>

      {/* Speed chart */}
      <SpeedChart />

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Searchbar
          placeholder={t("agents.search_placeholder")}
          value={search}
          onChangeText={setSearch}
          style={[styles.searchbar, { backgroundColor: theme.colors.surfaceVariant }]}
          inputStyle={{ fontSize: 13, minHeight: 0 }}
          elevation={0}
        />
        <View style={styles.toolbarRow}>
          <SegmentedButtons
            value={filter}
            onValueChange={(v) => setFilter(v as FilterMode)}
            buttons={[
              { value: "active", label: `${t("agents.active")} (${activeCount})` },
              { value: "all", label: t("agents.all") },
            ]}
            style={{ flex: 1 }}
            density="small"
          />
          <View style={styles.viewToggle}>
            <Pressable
              onPress={() => setViewMode("gallery")}
              style={[styles.viewBtn, viewMode === "gallery" && { backgroundColor: theme.colors.surfaceVariant }]}
            >
              <Ionicons name="grid" size={16} color={viewMode === "gallery" ? brandColors.primary : theme.colors.onSurfaceVariant} />
            </Pressable>
            <Pressable
              onPress={() => setViewMode("list")}
              style={[styles.viewBtn, viewMode === "list" && { backgroundColor: theme.colors.surfaceVariant }]}
            >
              <Ionicons name="list" size={16} color={viewMode === "list" ? brandColors.primary : theme.colors.onSurfaceVariant} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Content */}
      {viewMode === "gallery" ? (
        <FlatList
          data={tree}
          keyExtractor={(item) => item.main.id}
          renderItem={({ item }) => <GalleryRow node={item} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={brandColors.primary} />}
          ListEmptyComponent={<EmptyState filter={filter} />}
        />
      ) : (
        <FlatList
          data={flatList}
          keyExtractor={(item) => item.session.id}
          renderItem={({ item }) => <ListRow session={item.session} indented={item.indented} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={brandColors.primary} />}
          ListEmptyComponent={<EmptyState filter={filter} />}
        />
      )}
    </View>
  );
}

function EmptyState({ filter }: { filter: FilterMode }) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={styles.empty}>
      <Icon name="terminal-outline" size={48} color={theme.colors.onSurfaceVariant} />
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
        {filter === "active" ? t("agents.no_active") : t("agents.no_found")}
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
        {t("agents.pull_to_refresh")}
      </Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Summary
  summaryBar: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1 },
  summaryItem: { alignItems: "center", flex: 1 },
  summaryDivider: { width: 1, height: 28 },

  // Toolbar
  toolbar: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, gap: 8 },
  toolbarRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchbar: { height: 40, borderRadius: 12 },
  viewToggle: { flexDirection: "row", borderRadius: 8, overflow: "hidden" },
  viewBtn: { padding: 8, borderRadius: 8 },

  // List
  list: { padding: 12, gap: 8, paddingBottom: 20 },
  empty: { alignItems: "center", paddingTop: 80 },

  // Gallery card
  galleryCard: { borderRadius: 14, marginBottom: 4, overflow: "hidden" },
  galleryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, paddingBottom: 4 },
  galleryHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  galleryStats: { flexDirection: "row", gap: 8, alignItems: "center" },
  galleryStat: { fontSize: 11, color: "#8b8b96" },
  galleryBody: { paddingHorizontal: 12, paddingBottom: 10 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 3 },
  statusLabel: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  metaRow: { flexDirection: "row", gap: 8, marginTop: 4, alignItems: "center" },
  metaText: { fontSize: 11 },

  // Chips
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 12, paddingBottom: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipIndex: { fontSize: 10, fontWeight: "700", color: "#bbb", fontFamily: "monospace" },
  chipDesc: { fontSize: 11, color: "#ccc", maxWidth: 140 },
  chipModel: { fontSize: 10, color: "#888", fontFamily: "monospace" },
  chipSpeed: { fontSize: 10, color: "#30a46c", fontFamily: "monospace" },

  // Idle toggle
  idleSection: { paddingHorizontal: 12, paddingBottom: 8 },
  idleToggle: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  idleLabel: { fontSize: 11 },

  // List row
  listRow: { borderRadius: 10, padding: 10, marginBottom: 2 },
  listRowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  listRowLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  statusDotSmall: { width: 7, height: 7, borderRadius: 4 },
});
