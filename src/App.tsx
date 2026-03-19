import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { Onboarding } from "./components/Onboarding";
import { SessionDetail } from "./components/SessionDetail";
import { SessionList } from "./components/SessionList";
import { Wizard } from "./components/Wizard";
import { type Connection, resolveTheme, useConnectionStore, useDetailStore, useUIStore } from "./store";

const ONBOARDING_DISMISSED_KEY = "onboarding-dismissed";
const WIZARD_COMPLETED_KEY = "wizard-completed";

function App() {
  const { theme, viewMode } = useUIStore();
  const { connection, setConnection, disconnect } = useConnectionStore();

  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem(ONBOARDING_DISMISSED_KEY);
  });
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    const unlisten = listen("switch-connection", () => {
      useDetailStore.getState().close();
      disconnect();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [disconnect]);

  useEffect(() => {
    const apply = () => {
      document.documentElement.setAttribute("data-theme", resolveTheme(theme));
    };
    apply();

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  const handleConnected = useCallback(
    (conn: Connection) => {
      setConnection(conn);
    },
    [setConnection]
  );

  const finishOnboarding = useCallback(() => {
    setShowOnboarding(false);
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
    if (!localStorage.getItem(WIZARD_COMPLETED_KEY)) {
      setShowWizard(true);
    }
  }, []);

  const dismissWizard = useCallback(() => {
    setShowWizard(false);
    localStorage.setItem(WIZARD_COMPLETED_KEY, "1");
  }, []);

  // Show connection dialog until the user picks local or remote
  if (!connection) {
    return (
      <div className="app">
        <ConnectionDialog onConnected={handleConnected} />
      </div>
    );
  }

  return (
    <div className="app">
      {showOnboarding && <Onboarding onDismiss={finishOnboarding} />}
      {showWizard && <Wizard onDone={dismissWizard} />}
      <SessionList />
      {viewMode === "list" && <SessionDetail />}
    </div>
  );
}

export default App;
