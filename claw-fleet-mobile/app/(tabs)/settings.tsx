import {
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Button, Card, Divider, List, RadioButton, Text, useTheme } from "react-native-paper";
import { router } from "expo-router";
import { useConnectionStore } from "../../src/stores/connection";
import { usePreferencesStore, type ThemeMode, type Language } from "../../src/stores/preferences";
import { useT } from "../../src/i18n";

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const t = useT();
  const { baseUrl, desktopVersion, disconnect } = useConnectionStore();
  const { themeMode, setThemeMode, language, setLanguage } = usePreferencesStore();

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: "system", label: t("settings.theme_system") },
    { value: "light", label: t("settings.theme_light") },
    { value: "dark", label: t("settings.theme_dark") },
  ];

  const handleDisconnect = () => {
    Alert.alert(t("settings.disconnect"), t("settings.disconnect_confirm"), [
      { text: t("settings.cancel"), style: "cancel" },
      {
        text: t("settings.disconnect"),
        style: "destructive",
        onPress: () => {
          disconnect();
          router.replace("/");
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="contained">
        <Card.Content>
          <Text variant="titleMedium" style={{ fontWeight: "700", marginBottom: 12 }}>
            {t("settings.connection")}
          </Text>
          <List.Item
            title={t("settings.status")}
            right={() => (
              <View style={styles.statusBadge}>
                <View style={[styles.dot, { backgroundColor: "#22c55e" }]} />
                <Text variant="labelMedium" style={{ color: "#22c55e" }}>
                  {t("settings.connected")}
                </Text>
              </View>
            )}
            titleStyle={styles.listTitle}
          />
          <Divider style={{ backgroundColor: theme.colors.outline }} />
          <List.Item
            title={t("settings.server")}
            description={baseUrl || t("settings.unknown")}
            descriptionNumberOfLines={1}
            descriptionStyle={{ fontSize: 11 }}
            titleStyle={styles.listTitle}
          />
          <Divider style={{ backgroundColor: theme.colors.outline }} />
          <List.Item
            title={t("settings.desktop_version")}
            right={() => (
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {desktopVersion || t("settings.unknown")}
              </Text>
            )}
            titleStyle={styles.listTitle}
          />
        </Card.Content>
      </Card>

      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="contained">
        <Card.Content>
          <Text variant="titleMedium" style={{ fontWeight: "700", marginBottom: 12 }}>
            {t("settings.appearance")}
          </Text>
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
            {t("settings.theme")}
          </Text>
          <RadioButton.Group
            onValueChange={(v) => setThemeMode(v as ThemeMode)}
            value={themeMode}
          >
            {themeOptions.map((opt) => (
              <RadioButton.Item
                key={opt.value}
                label={opt.label}
                value={opt.value}
                labelStyle={styles.listTitle}
                style={styles.radioItem}
              />
            ))}
          </RadioButton.Group>
          <Divider style={{ backgroundColor: theme.colors.outline, marginVertical: 8 }} />
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
            {t("settings.language")}
          </Text>
          <RadioButton.Group
            onValueChange={(v) => setLanguage(v as Language)}
            value={language}
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <RadioButton.Item
                key={opt.value}
                label={opt.label}
                value={opt.value}
                labelStyle={styles.listTitle}
                style={styles.radioItem}
              />
            ))}
          </RadioButton.Group>
        </Card.Content>
      </Card>

      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="contained">
        <Card.Content>
          <Text variant="titleMedium" style={{ fontWeight: "700", marginBottom: 12 }}>
            {t("settings.about")}
          </Text>
          <List.Item
            title={t("settings.app")}
            right={() => (
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Claw Fleet Mobile v1.0.0
              </Text>
            )}
            titleStyle={styles.listTitle}
          />
        </Card.Content>
      </Card>

      <View style={styles.disconnectContainer}>
        <Button
          mode="outlined"
          onPress={handleDisconnect}
          textColor={theme.colors.error}
          style={{ borderColor: theme.colors.error }}
        >
          {t("settings.disconnect")}
        </Button>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { margin: 12, borderRadius: 16 },
  listTitle: { fontSize: 14 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  radioItem: { paddingVertical: 2 },
  disconnectContainer: { paddingHorizontal: 12, marginTop: 8 },
});
