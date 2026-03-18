import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { Onboarding } from "./components/Onboarding";
import { SessionDetail } from "./components/SessionDetail";
import { SessionList } from "./components/SessionList";
import { Wizard } from "./components/Wizard";
import { resolveTheme, useUIStore } from "./store";

const ONBOARDING_DISMISSED_KEY = "onboarding-dismissed";
const WIZARD_COMPLETED_KEY = "wizard-completed";

function App() {
  const { theme, viewMode } = useUIStore();
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem(ONBOARDING_DISMISSED_KEY);
  });
  const [showWizard, setShowWizard] = useState(false);

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

  const finishOnboarding = useCallback(() => {
    setShowOnboarding(false);
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
    // Show wizard tour if never completed
    if (!localStorage.getItem(WIZARD_COMPLETED_KEY)) {
      setShowWizard(true);
    }
  }, []);

  const dismissWizard = useCallback(() => {
    setShowWizard(false);
    localStorage.setItem(WIZARD_COMPLETED_KEY, "1");
  }, []);

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
