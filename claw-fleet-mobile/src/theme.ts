import { MD3DarkTheme, MD3LightTheme } from "react-native-paper";

export const brandColors = {
  primary: "#6366f1",       // indigo
  primaryDark: "#4f46e5",
  secondary: "#8b5cf6",     // violet
  success: "#30a46c",       // Linear-style green
  warning: "#f5a623",       // amber
  error: "#e5484d",         // Linear-style red
  info: "#0ea5e9",          // sky
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: brandColors.primary,
    primaryContainer: "#1e1b4b",
    secondary: brandColors.secondary,
    error: brandColors.error,
    background: "#111113",            // warm near-black
    surface: "#19191d",               // warm dark gray
    surfaceVariant: "#222228",        // slightly lighter
    onBackground: "#ededef",
    onSurface: "#ededef",
    onSurfaceVariant: "#8b8b96",
    outline: "#2c2c35",
    elevation: {
      level0: "transparent",
      level1: "#19191d",
      level2: "#1f1f25",
      level3: "#25252d",
      level4: "#292932",
      level5: "#2d2d38",
    },
  },
};

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: brandColors.primary,
    primaryContainer: "#e8e8ff",
    secondary: brandColors.secondary,
    error: brandColors.error,
    background: "#f9f9fb",
    surface: "#ffffff",
    surfaceVariant: "#f3f3f6",
    onBackground: "#111113",
    onSurface: "#111113",
    onSurfaceVariant: "#65656e",
    outline: "#e4e4e8",
  },
};

export const statusColors = {
  thinking: brandColors.success,
  streaming: brandColors.success,
  executing: brandColors.warning,
  processing: brandColors.warning,
  delegating: "#8b5cf6",
  waitingInput: "#3b82f6",
  active: brandColors.info,
  idle: "#6b7280",
} as const;
