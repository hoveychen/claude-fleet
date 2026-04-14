import { useCallback, useState } from "react";

/** Collapsible-section state persisted in localStorage under `collapsed:<key>`. */
export function useCollapsed(key: string, defaultCollapsed = false): [boolean, (v: boolean) => void] {
  const storageKey = `collapsed:${key}`;
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === "true") return true;
      if (raw === "false") return false;
    } catch {}
    return defaultCollapsed;
  });
  const setCollapsed = useCallback(
    (v: boolean) => {
      try {
        localStorage.setItem(storageKey, v ? "true" : "false");
      } catch {}
      setCollapsedState(v);
    },
    [storageKey],
  );
  return [collapsed, setCollapsed];
}
