import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export type ThemeMode = "system" | "light" | "dark";
export type Language = "en" | "zh";

interface PreferencesState {
  themeMode: ThemeMode;
  language: Language;
  setThemeMode: (mode: ThemeMode) => void;
  setLanguage: (lang: Language) => void;
  restore: () => Promise<void>;
}

const STORAGE_KEY = "claw_fleet_preferences";

function persist(state: PreferencesState) {
  AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ themeMode: state.themeMode, language: state.language }),
  ).catch(() => {});
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  themeMode: "system",
  language: "en",

  setThemeMode: (mode) => {
    set({ themeMode: mode });
    persist(get());
  },

  setLanguage: (lang) => {
    set({ language: lang });
    persist(get());
  },

  restore: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const patch: Partial<PreferencesState> = {};
        if (data.themeMode) patch.themeMode = data.themeMode;
        if (data.language) patch.language = data.language;
        set(patch);
      }
    } catch {}
  },
}));
