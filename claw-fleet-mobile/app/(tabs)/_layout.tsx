import { useEffect, useCallback } from "react";
import { Tabs } from "expo-router";
import { useTheme } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConnectionStore } from "../../src/stores/connection";
import { useSessionsStore } from "../../src/stores/sessions";
import { useSSE } from "../../src/api/sse";
import { useT } from "../../src/i18n";
import type { SessionInfo, WaitingAlert } from "../../src/types";

export default function TabLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const client = useConnectionStore((s) => s.client);
  const setSessions = useSessionsStore((s) => s.setSessions);
  const addAlert = useSessionsStore((s) => s.addAlert);

  // Initial data fetch
  useEffect(() => {
    if (!client) return;
    client.listSessions().then(setSessions).catch(() => {});
    client
      .getWaitingAlerts()
      .then((alerts) => useSessionsStore.getState().setAlerts(alerts))
      .catch(() => {});
  }, [client]);

  // SSE for real-time updates
  const sseUrl = client?.sseUrl() ?? null;
  const onSessionsUpdated = useCallback(
    (sessions: SessionInfo[]) => setSessions(sessions),
    [setSessions],
  );
  const onWaitingAlert = useCallback(
    (alert: WaitingAlert) => addAlert(alert),
    [addAlert],
  );
  useSSE(sseUrl, { onSessionsUpdated, onWaitingAlert });

  // Fallback polling (longer interval since SSE is primary)
  useEffect(() => {
    if (!client) return;
    const interval = setInterval(() => {
      client.listSessions().then(setSessions).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [client, setSessions]);

  const activeCount = useSessionsStore(
    (s) => s.sessions.filter((sess) => sess.status !== "idle").length,
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline,
          height: 52 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: -2,
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.onSurface,
        headerShadowVisible: false,
        headerTitleStyle: {
          fontWeight: "700",
          fontSize: 18,
        },
      }}
    >
      <Tabs.Screen
        name="agents"
        options={{
          title: t("tabs.agents"),
          tabBarBadge: activeCount > 0 ? activeCount : undefined,
          tabBarBadgeStyle: { backgroundColor: "#22c55e", fontSize: 10 },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="terminal" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: t("tabs.report"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="audit"
        options={{
          title: t("tabs.audit"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("tabs.settings"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-sharp" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
