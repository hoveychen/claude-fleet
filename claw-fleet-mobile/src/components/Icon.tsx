import { Text, StyleSheet } from "react-native";

/** Simple text-based icon component — no native dependencies, no crash risk */

const ICONS: Record<string, string> = {
  // Tab bar
  terminal: "⌘",
  "bar-chart": "▊",
  "shield-checkmark": "⛨",
  "settings-sharp": "⚙",
  // Status
  bulb: "◉",
  "arrow-down-circle": "◉",
  "play-circle": "◉",
  "sync-circle": "◉",
  "git-network": "◉",
  "pause-circle": "◉",
  "radio-button-on": "◉",
  "ellipse-outline": "○",
  // Subagent types
  search: "◎",
  clipboard: "☰",
  build: "⚒",
  book: "☶",
  "git-branch": "⎇",
  // Actions
  "chevron-up": "▴",
  "chevron-down": "▾",
  "dots-vertical": "⋮",
  "stop-circle": "⏹",
  refresh: "⟳",
  // UI
  grid: "⊞",
  list: "☰",
  construct: "⚒",
  "git-commit": "─",
  "terminal-outline": "⌘",
  "hourglass": "⧗",
  person: "◉",
  sparkles: "✦",
  "bulb-outline": "✦",
  "checkmark-circle": "●",
  "close-circle": "●",
  // Source
  "code-slash": "⌨",
  "logo-octocat": "⊙",
  cube: "▣",
};

interface IconProps {
  name: string;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 16, color = "#888" }: IconProps) {
  const char = ICONS[name] || "•";
  return (
    <Text style={[styles.icon, { fontSize: size, color, lineHeight: size * 1.2 }]}>
      {char}
    </Text>
  );
}

const styles = StyleSheet.create({
  icon: {
    textAlign: "center",
  },
});
