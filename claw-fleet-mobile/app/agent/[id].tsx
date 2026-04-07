import { useCallback, useEffect, useMemo, useState, memo } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  ScrollView,
} from "react-native";
import { IconButton, Menu, Text, TouchableRipple, useTheme } from "react-native-paper";
import { Icon } from "../../src/components/Icon";
import { useLocalSearchParams, Stack, router } from "expo-router";
import Markdown from "react-native-markdown-display";
import { useConnectionStore } from "../../src/stores/connection";
import { useSessionsStore } from "../../src/stores/sessions";
import { statusColors, brandColors } from "../../src/theme";
import { useT } from "../../src/i18n";
import type { RawMessage, ContentBlock, SessionInfo } from "../../src/types";

// ── Helpers ────────────────────────────────────────────────────────────────

function getBlocks(content: ContentBlock[] | string): ContentBlock[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}

function toolSummary(input: Record<string, unknown>): string {
  if ("command" in input) return String(input.command);
  if ("file_path" in input) return String(input.file_path);
  if ("pattern" in input) {
    const path = input.path ? ` in ${input.path}` : "";
    return `${input.pattern}${path}`;
  }
  if ("query" in input) return String(input.query);
  if ("url" in input) return String(input.url);
  if ("old_string" in input && "new_string" in input)
    return String(input.file_path || "");
  return "";
}

function diffStats(input: Record<string, unknown>): { add: number; del: number } | null {
  if ("old_string" in input && "new_string" in input) {
    const oldLines = String(input.old_string || "").split("\n").length;
    const newLines = String(input.new_string || "").split("\n").length;
    return { add: newLines, del: oldLines };
  }
  if ("content" in input) {
    const lines = String(input.content || "").split("\n").length;
    return { add: lines, del: 0 };
  }
  return null;
}

function resultPreview(result: ContentBlock | undefined): string | null {
  if (!result) return null;
  const content = (result as any).content;
  if (!content) return null;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  if (text.length < 5) return null;
  return text;
}

// ── Block renderers ────────────────────────────────────────────────────────

/** User message — right-aligned dark bubble */
function UserMessage({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.userRow}>
      <View style={[styles.userBubble, { backgroundColor: theme.colors.surfaceVariant }]}>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

/** Inline text from assistant — no bubble, just body text */
function AssistantText({ text }: { text: string }) {
  const theme = useTheme();

  const mdStyles = useMemo(
    () =>
      StyleSheet.create({
        body: { color: theme.colors.onSurface, fontSize: 14, lineHeight: 21 },
        code_inline: {
          backgroundColor: theme.colors.surfaceVariant,
          color: "#e879f9",
          paddingHorizontal: 5,
          paddingVertical: 1,
          borderRadius: 4,
          fontSize: 12.5,
          fontFamily: "monospace",
        },
        fence: {
          backgroundColor: "#1a1a1f",
          padding: 12,
          borderRadius: 8,
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: 18,
          color: "#d4d4d8",
          marginVertical: 6,
        },
        heading1: { fontSize: 17, fontWeight: "700" as const, marginTop: 12, marginBottom: 4, color: theme.colors.onSurface },
        heading2: { fontSize: 15, fontWeight: "700" as const, marginTop: 10, marginBottom: 4, color: theme.colors.onSurface },
        heading3: { fontSize: 14, fontWeight: "600" as const, marginTop: 8, marginBottom: 2, color: theme.colors.onSurface },
        link: { color: brandColors.primary, textDecorationLine: "none" as const },
        blockquote: {
          borderLeftWidth: 3,
          borderLeftColor: theme.colors.outline,
          paddingLeft: 12,
          marginVertical: 4,
          opacity: 0.85,
        },
        list_item: { marginVertical: 1 },
        bullet_list: { marginVertical: 4 },
        ordered_list: { marginVertical: 4 },
        strong: { fontWeight: "700" as const, color: theme.colors.onSurface },
        paragraph: { marginVertical: 3 },
      }),
    [theme],
  );

  const display = text.length > 4000 ? text.slice(0, 4000) + "\n\n…" : text;
  return <Markdown style={mdStyles}>{display}</Markdown>;
}

/** Tool call — compact inline bar (Claude Code / Gemini style) */
function ToolCallView({
  block,
  result,
}: {
  block: ContentBlock;
  result?: ContentBlock;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const name = (block as any).name || "tool";
  const input = (block as any).input || {};
  const summary = toolSummary(input);
  const diff = diffStats(input);
  const isError = result && (result as any).is_error;
  const isDone = !!result;
  const resultText = resultPreview(result);

  const dotColor = !isDone
    ? brandColors.warning
    : isError
      ? brandColors.error
      : brandColors.success;

  // Dark background for tool bars in both light and dark mode (terminal-style)
  const toolBg = "#1e1e24";

  return (
    <View style={styles.toolSection}>
      <TouchableRipple
        onPress={() => setExpanded(!expanded)}
        style={[styles.toolBar, { backgroundColor: toolBg }]}
      >
        <View style={styles.toolBarInner}>
          <View style={styles.toolBarLeft}>
            <View style={[styles.toolDot, { backgroundColor: dotColor }]} />
            <Text style={[styles.toolName, { color: "#e4e4e8" }]}>{name}</Text>
            {summary ? (
              <Text
                style={[styles.toolSummary, { color: "#9898a0" }]}
                numberOfLines={1}
              >
                {summary}
              </Text>
            ) : null}
          </View>
          <Icon
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color="#7a7a84"
          />
        </View>
      </TouchableRipple>

      {/* Diff stats line */}
      {diff && !expanded && (
        <View style={styles.diffRow}>
          <Icon name="git-commit" size={12} color={theme.colors.onSurfaceVariant} />
          <Text style={styles.diffDel}>-{diff.del}</Text>
          <Text style={styles.diffAdd}>+{diff.add}</Text>
        </View>
      )}

      {/* Result preview (when not expanded) */}
      {!expanded && isDone && !diff && resultText && (
        <Text
          style={[styles.toolResultPreview, { color: theme.colors.onSurfaceVariant }]}
          numberOfLines={1}
        >
          {resultText.slice(0, 80)}
        </Text>
      )}

      {/* Expanded content */}
      {expanded && (
        <View style={[styles.toolExpanded, { backgroundColor: "#111114" }]}>
          {/* Input */}
          {summary ? (
            <View style={styles.toolExpandSection}>
              <Text style={styles.toolExpandLabel}>IN</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={styles.toolExpandCode} selectable>
                  {typeof input === "object" && "command" in input
                    ? String(input.command)
                    : JSON.stringify(input, null, 2).slice(0, 1500)}
                </Text>
              </ScrollView>
            </View>
          ) : null}
          {/* Output */}
          {resultText && (
            <View style={styles.toolExpandSection}>
              <Text style={[styles.toolExpandLabel, isError && { color: brandColors.error }]}>
                {isError ? "ERR" : "OUT"}
              </Text>
              <Text
                style={[
                  styles.toolExpandCode,
                  isError && { color: brandColors.error },
                ]}
                selectable
                numberOfLines={25}
              >
                {resultText.slice(0, 2000)}
                {(resultText.length || 0) > 2000 ? "\n…" : ""}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** Thinking indicator — collapsed one-liner */
function ThinkingView({ thinking }: { thinking: string }) {
  const theme = useTheme();
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableRipple onPress={() => setExpanded(!expanded)}>
      <View style={styles.thinkingRow}>
        <Text style={styles.thinkingIcon}>✦</Text>
        <Text style={[styles.thinkingLabel, { color: theme.colors.onSurfaceVariant }]}>
          {expanded ? t("detail.thinking") : t("detail.thinking_tap")}
        </Text>
        {expanded && (
          <Text
            style={[styles.thinkingText, { color: theme.colors.onSurfaceVariant }]}
            selectable
          >
            {thinking.slice(0, 2000)}
            {thinking.length > 2000 ? "…" : ""}
          </Text>
        )}
      </View>
    </TouchableRipple>
  );
}

// ── Message renderer ───────────────────────────────────────────────────────

/** Renders a single message as a timeline segment */
const MessageSegment = memo(function MessageSegment({ msg }: { msg: RawMessage }) {
  if (!msg.message) return null;

  const isUser = msg.message.role === "user";
  const blocks = getBlocks(msg.message.content);

  // Build tool result map
  const toolResults = new Map<string, ContentBlock>();
  for (const b of blocks) {
    if (b.type === "tool_result" && (b as any).tool_use_id) {
      toolResults.set((b as any).tool_use_id, b);
    }
  }

  if (isUser) {
    // User: extract text
    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => (b as any).text)
      .join("\n");
    if (!text?.trim()) return null;
    return <UserMessage text={text} />;
  }

  // Assistant: render blocks sequentially as a timeline
  const segments: React.ReactElement[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "text" && (b as any).text?.trim()) {
      segments.push(<AssistantText key={i} text={(b as any).text} />);
    } else if (b.type === "tool_use") {
      const result = toolResults.get((b as any).id);
      segments.push(<ToolCallView key={i} block={b} result={result} />);
    } else if (b.type === "thinking" && (b as any).thinking) {
      segments.push(<ThinkingView key={i} thinking={(b as any).thinking} />);
    }
  }

  if (segments.length === 0) return null;
  return <View style={styles.assistantSegment}>{segments}</View>;
});

// ── Screen ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function AgentDetailScreen() {
  const theme = useTheme();
  const t = useT();
  const params = useLocalSearchParams<{ id: string; jsonlPath: string }>();
  const client = useConnectionStore((s) => s.client);
  const session = useSessionsStore((s) =>
    s.sessions.find((sess) => sess.id === params.id),
  );
  const [allMessages, setAllMessages] = useState<RawMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [menuVisible, setMenuVisible] = useState(false);

  // Build sibling tabs (parent + subagents)
  const sessions = useSessionsStore((s) => s.sessions);
  const tabs = useMemo(() => {
    if (!session) return [];
    let parent: SessionInfo | undefined;
    let subs: SessionInfo[];
    if (session.isSubagent && session.parentSessionId) {
      parent = sessions.find((s) => s.id === session.parentSessionId);
      subs = sessions.filter(
        (s) => s.isSubagent && s.parentSessionId === session.parentSessionId,
      );
    } else {
      parent = session;
      subs = sessions.filter(
        (s) => s.isSubagent && s.parentSessionId === session.id,
      );
    }
    if (!parent || subs.length === 0) return [];
    return [parent, ...subs];
  }, [session, sessions]);

  const fetchMessages = useCallback(async () => {
    if (!client || !params.jsonlPath) return;
    try {
      setAllMessages(await client.getMessages(params.jsonlPath));
    } catch {}
    setLoading(false);
  }, [client, params.jsonlPath]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  const displayMessages = useMemo(() => {
    const meaningful = allMessages.filter(
      (m) => m.message && (m.type === "user" || m.type === "assistant"),
    );
    const reversed = [...meaningful].reverse();
    return reversed.slice(0, page * PAGE_SIZE);
  }, [allMessages, page]);

  const hasMore = useMemo(() => {
    const total = allMessages.filter(
      (m) => m.message && (m.type === "user" || m.type === "assistant"),
    ).length;
    return page * PAGE_SIZE < total;
  }, [allMessages, page]);

  const handleKill = () => {
    if (!session?.pid || !client) return;
    setMenuVisible(false);
    Alert.alert(t("detail.stop_agent"), t("detail.stop_confirm", { name: session.workspaceName }), [
      { text: t("detail.cancel"), style: "cancel" },
      {
        text: t("detail.stop"),
        style: "destructive",
        onPress: () =>
          client.killSession(session.pid!).catch((e) => Alert.alert("Error", String(e))),
      },
    ]);
  };

  const statusColor = session ? statusColors[session.status] || "#6b7280" : "#6b7280";

  return (
    <>
      <Stack.Screen
        options={{
          title: session?.workspaceName || "Agent",
          headerRight: () => (
            <Menu
              visible={menuVisible}
              onDismiss={() => setMenuVisible(false)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  size={22}
                  onPress={() => setMenuVisible(true)}
                />
              }
            >
              {session?.pid && (
                <Menu.Item
                  onPress={handleKill}
                  title={t("detail.stop_agent")}
                  leadingIcon="stop-circle"
                  titleStyle={{ color: brandColors.error }}
                />
              )}
              <Menu.Item
                onPress={() => { setMenuVisible(false); setPage(1); fetchMessages(); }}
                title={t("detail.refresh")}
                leadingIcon="refresh"
              />
            </Menu>
          ),
        }}
      />
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Subagent tabs */}
        {tabs.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.tabBar, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.outline }]}
            contentContainerStyle={styles.tabBarContent}
          >
            {tabs.map((t) => {
              const isCurrent = t.id === session?.id;
              const tabColor = statusColors[t.status] || "#6b7280";
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    if (!isCurrent) {
                      router.replace({
                        pathname: "/agent/[id]",
                        params: { id: t.id, jsonlPath: t.jsonlPath },
                      });
                    }
                  }}
                  style={[
                    styles.tab,
                    isCurrent && { borderBottomWidth: 2, borderBottomColor: brandColors.primary },
                  ]}
                >
                  <View style={[styles.tabDot, { backgroundColor: tabColor }]} />
                  <Text style={[styles.tabLabel, isCurrent && { color: theme.colors.onSurface, fontWeight: "700" }]}>
                    {t.isSubagent ? `⎇ ${t.agentType || "sub"}` : "◈ main"}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Status bar */}
        {session && (
          <View style={[styles.statusBar, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.outline }]}>
            <View style={styles.statusLeft}>
              <View style={[styles.statusDot, { backgroundColor: statusColor, shadowColor: statusColor, shadowOpacity: 0.5, shadowRadius: 3 }]} />
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ fontWeight: "700" }} numberOfLines={1}>
                  {session.isSubagent
                    ? session.agentDescription || session.agentType || session.workspaceName
                    : session.aiTitle || session.slug || session.workspaceName}
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                  {session.isSubagent ? `⎇ ${session.agentType || "sub"} · ` : ""}
                  {session.model?.replace("claude-", "").replace(/-20\d+$/, "") || ""} · {Math.round(session.tokenSpeed)} t/s · {session.totalOutputTokens.toLocaleString()} tokens
                  {session.contextPercent != null ? ` · ctx ${session.contextPercent}%` : ""}
                </Text>
              </View>
            </View>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <View style={styles.loadingCenter}>
              <Text style={styles.thinkingIcon}>✦</Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                {t("detail.loading")}
              </Text>
            </View>
          </View>
        ) : (
          <FlatList
            data={displayMessages}
            keyExtractor={(item, i) => item.uuid || String(i)}
            renderItem={({ item }) => <MessageSegment msg={item} />}
            contentContainerStyle={styles.list}
            inverted
            ListFooterComponent={
              hasMore ? (
                <TouchableRipple onPress={() => setPage((p) => p + 1)} style={styles.loadMore}>
                  <Text variant="labelMedium" style={{ color: brandColors.primary }}>
                    {t("detail.load_earlier")}
                  </Text>
                </TouchableRipple>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.loadingContainer}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {t("detail.no_messages")}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Subagent tabs
  tabBar: { borderBottomWidth: 1 },
  tabBarContent: { paddingHorizontal: 8, gap: 4 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  tabDot: { width: 6, height: 6, borderRadius: 3 },
  tabLabel: { fontSize: 12, color: "#8b8b96" },

  // Status bar
  statusBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },

  // Message list
  list: { paddingHorizontal: 14, paddingVertical: 8, gap: 12 },
  loadMore: { alignItems: "center", paddingVertical: 12 },
  loadingContainer: { flexGrow: 1, flexBasis: 0 },
  loadingCenter: { flex: 1, justifyContent: "center", alignItems: "center" },

  // User message
  userRow: { flexDirection: "row", justifyContent: "flex-end" },
  userBubble: {
    maxWidth: "85%",
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  // Assistant segment (no bubble — inline timeline)
  assistantSegment: { gap: 6 },

  // Tool call bar
  toolSection: { gap: 2 },
  toolBar: {
    borderRadius: 8,
    overflow: "hidden",
  },
  toolBarInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  toolBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  toolDot: { width: 7, height: 7, borderRadius: 4 },
  toolName: {
    fontWeight: "700",
    fontSize: 13,
    fontFamily: "monospace",
    color: "#ededef",
  },
  toolSummary: {
    fontSize: 12,
    fontFamily: "monospace",
    flex: 1,
  },

  // Diff stats
  diffRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 28,
    paddingVertical: 2,
  },
  diffDel: { color: "#e5484d", fontSize: 12, fontFamily: "monospace", fontWeight: "600" },
  diffAdd: { color: "#30a46c", fontSize: 12, fontFamily: "monospace", fontWeight: "600" },

  // Tool result preview
  toolResultPreview: {
    fontSize: 11,
    fontFamily: "monospace",
    paddingLeft: 28,
    paddingVertical: 2,
  },

  // Tool expanded
  toolExpanded: {
    borderRadius: 8,
    marginTop: 2,
    padding: 10,
    gap: 8,
  },
  toolExpandSection: {
    gap: 2,
  },
  toolExpandLabel: {
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "monospace",
    color: "#6b7280",
    letterSpacing: 0.5,
  },
  toolExpandCode: {
    fontSize: 11.5,
    fontFamily: "monospace",
    color: "#d4d4d8",
    lineHeight: 17,
  },

  // Thinking
  thinkingRow: {
    paddingVertical: 4,
    gap: 4,
  },
  thinkingIcon: {
    color: "#f5a623",
    fontSize: 14,
  },
  thinkingLabel: {
    fontSize: 13,
    fontStyle: "italic",
  },
  thinkingText: {
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 18,
    marginTop: 4,
  },
});
