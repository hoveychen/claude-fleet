import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useConnectionStore } from "../src/stores/connection";
import { usePreferencesStore } from "../src/stores/preferences";
import { darkTheme, lightTheme } from "../src/theme";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const restorePrefs = usePreferencesStore((s) => s.restore);
  const isDark = themeMode === "system" ? colorScheme === "dark" : themeMode === "dark";
  const theme = isDark ? darkTheme : lightTheme;
  const [restoring, setRestoring] = useState(true);
  const restoreConnection = useConnectionStore((s) => s.restoreConnection);

  useEffect(() => {
    Promise.all([restoreConnection(), restorePrefs()]).finally(() => setRestoring(false));
  }, []);

  if (restoring) return null;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: theme.colors.surface,
            },
            headerTintColor: theme.colors.onSurface,
            headerShadowVisible: false,
            contentStyle: {
              backgroundColor: theme.colors.background,
            },
          }}
        >
          <Stack.Screen
            name="index"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="(tabs)"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="agent/[id]"
            options={{ title: "Agent", presentation: "card" }}
          />
        </Stack>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
