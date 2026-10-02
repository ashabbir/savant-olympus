import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { BottomBar } from "./components/BottomBar";
import { LeftSidebar } from "./components/LeftSidebar";
import { LoginScreen } from "./components/LoginScreen";
import { OlympusViewport } from "./components/OlympusViewport";
import { RightPanel } from "./components/RightPanel";
import StartupScreen from "./components/StartupScreen";
import { TopBar } from "./components/TopBar";
import { useOlympusSession } from "./hooks/useOlympusSession";
import { getStoredApiKey } from "./services/auth";
import { createSkillsService } from "./services/skillsService";

export default function App() {
  const [activeTab, setActiveTab] = useState("Workspace");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const session = useOlympusSession(activeTab);

  useEffect(() => {
    const switchTab = (event: Event) => {
      if (session.runtime.isGuest) return;
      const tab = (event as CustomEvent<string>).detail;
      if (tab) setActiveTab(tab);
    };
    window.addEventListener("switch-tab", switchTab);
    return () => window.removeEventListener("switch-tab", switchTab);
  }, [session.runtime.isGuest]);

  useEffect(() => {
    if (session.isInitializing || !session.isAuthenticated || !getStoredApiKey()) return;
    const { apiKey, serverUrl } = session.runtime;
    createSkillsService(serverUrl, apiKey).installDefaultSkillsForPresentProviders().catch((error) => {
      console.warn("Unable to install default Savant skills for local providers:", error);
    });
  }, [session.isInitializing, session.isAuthenticated, session.runtime.apiKey, session.runtime.serverUrl]);

  if (session.isInitializing) {
    return <StartupScreen progress={session.startupProgress} subtext={session.startupSubtext} />;
  }

  if (!session.isAuthenticated || !getStoredApiKey()) {
    return <LoginScreen onLogin={session.login} initialServerUrl={session.settings["server:config"]?.url} />;
  }

  const { apiKey, activeModel, isAdmin, isGuest, serverUrl } = session.runtime;
  const currentTab = isGuest ? "Knowledge" : activeTab;
  const logout = async () => {
    await session.logout();
    setSelectedProject(null);
  };

  return (
    <div className="size-full flex flex-col overflow-hidden" style={{ background: "var(--cp-bg-0)", color: "var(--foreground)", fontFamily: "'Rajdhani', sans-serif" }}>
      <div className="fixed inset-0 pointer-events-none z-[999]" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)" }} />
      <TopBar />
      <div className="flex flex-1 overflow-hidden relative">
        <LeftSidebar onSettingsChanged={session.refreshSettings} onLogout={logout} activeTab={currentTab} onChangeTab={(tab) => { if (!isGuest) setActiveTab(tab); }} isAdmin={isAdmin} isGuest={isGuest} />
        <OlympusViewport
          activeTab={currentTab}
          serverUrl={serverUrl}
          apiKey={apiKey}
          activeModel={activeModel}
          isAdmin={isAdmin}
          isGuest={isGuest}
          activeUserId={session.settings["user:id"] || ""}
          selectedProject={selectedProject}
          onSelectProject={setSelectedProject}
          onSettingsChanged={session.refreshSettings}
        />
        <RightPanel thinking={session.thinking} statusText={session.statusText} activeTab={activeTab} serverUrl={serverUrl} apiKey={apiKey} selectedProject={selectedProject} isAdmin={isAdmin} />
      </div>
      <BottomBar />
      <Toaster position="top-right" richColors theme="dark" toastOptions={{ style: { fontFamily: "'Rajdhani', monospace", fontSize: "12px" } }} />
    </div>
  );
}
