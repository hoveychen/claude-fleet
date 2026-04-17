import type { Components } from "react-markdown";
import { openUrl } from "@tauri-apps/plugin-opener";

export function safeLinkComponent(): Components["a"] {
  return function SafeLink({ href, children }) {
    const isExternal = !!href && /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          if (isExternal && href) {
            void openUrl(href);
          }
        }}
      >
        {children}
      </a>
    );
  };
}

export const safeMarkdownComponents: Components = {
  a: safeLinkComponent(),
};
