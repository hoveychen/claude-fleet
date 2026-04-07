import en from "./locales/en.json";
import zh from "./locales/zh.json";
import { usePreferencesStore } from "./stores/preferences";

const messages: Record<string, typeof en> = { en, zh };

type Leaves<T, Prefix extends string = ""> = T extends object
  ? { [K in keyof T & string]: Leaves<T[K], Prefix extends "" ? K : `${Prefix}.${K}`> }[keyof T & string]
  : Prefix;

export type TranslationKey = Leaves<typeof en>;

function get(obj: unknown, path: string): string {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur == null || typeof cur !== "object") return path;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" ? cur : path;
}

export function useT() {
  const lang = usePreferencesStore((s) => s.language);
  const dict = messages[lang] || messages.en;

  return function t(key: TranslationKey, params?: Record<string, string | number>): string {
    let text = get(dict, key);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{{${k}}}`, String(v));
      }
    }
    return text;
  };
}
