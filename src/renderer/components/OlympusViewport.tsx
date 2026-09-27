import { lazy, Suspense } from "react";
import { RemindersView } from "./tabs/RemindersView";
import { WorkspaceView } from "./tabs/WorkspaceView";
import type { OlympusModel } from "@/services/olympusRuntime";

const KnowledgeView = lazy(() => import("./tabs/KnowledgeView").then((m) => ({ default: m.KnowledgeView })));
const ContextView = lazy(() => import("./tabs/ContextView").then((m) => ({ default: m.ContextView })));
const AbilitiesView = lazy(() => import("./tabs/AbilitiesView").then((m) => ({ default: m.AbilitiesView })));
const SkillsView = lazy(() => import("./tabs/SkillsView").then((m) => ({ default: m.SkillsView })));
const ToolsView = lazy(() => import("./tabs/ToolsView").then((m) => ({ default: m.ToolsView })));
const UsersView = lazy(() => import("./tabs/UsersView").then((m) => ({ default: m.UsersView })));
const ActivityLogsView = lazy(() => import("./tabs/ActivityLogsView").then((m) => ({ default: m.ActivityLogsView })));
const AgentSetupView = lazy(() => import("./tabs/AgentSetupView").then((m) => ({ default: m.AgentSetupView })));

const ViewportFallback = (
  <div className="size-full flex items-center justify-center font-mono text-xs text-[var(--cp-cyan)] animate-pulse">
    INITIALIZING_VIEWPORT_STREAM...
  </div>
);

interface OlympusViewportProps {
  activeTab: string;
  serverUrl: string;
  apiKey: string;
  activeModel: OlympusModel;
  isAdmin: boolean;
  activeUserId: string;
  selectedProject: string | null;
  onSelectProject: (project: string | null) => void;
  onSettingsChanged: () => Promise<void>;
}

export function OlympusViewport(props: OlympusViewportProps) {
  const { activeTab, serverUrl, apiKey, activeModel, isAdmin } = props;
  let view;

  switch (activeTab) {
    case "Knowledge":
      view = <KnowledgeView serverUrl={serverUrl} apiKey={apiKey} isAdmin={isAdmin} />;
      break;
    case "Context":
      view = <ContextView serverUrl={serverUrl} apiKey={apiKey} selectedProject={props.selectedProject} onSelectProject={props.onSelectProject} activeModel={activeModel} isAdmin={isAdmin} />;
      break;
    case "Tools":
      view = <ToolsView serverUrl={serverUrl} apiKey={apiKey} isAdmin={isAdmin} />;
      break;
    case "Skills":
      view = <SkillsView serverUrl={serverUrl} apiKey={apiKey} activeModel={activeModel} isAdmin={isAdmin} />;
      break;
    case "Abilities":
      view = <AbilitiesView serverUrl={serverUrl} apiKey={apiKey} isAdmin={isAdmin} activeModel={activeModel} />;
      break;
    case "Users":
      view = isAdmin
        ? <UsersView serverUrl={serverUrl} apiKey={apiKey} activeUserId={props.activeUserId} onSettingsChanged={props.onSettingsChanged} isAdmin={isAdmin} />
        : <WorkspaceView serverUrl={serverUrl} apiKey={apiKey} sessionId={null} />;
      break;
    case "Agents":
      view = <AgentSetupView serverUrl={serverUrl} apiKey={apiKey} isAdmin={isAdmin} />;
      break;
    case "Reminders":
      view = <RemindersView serverUrl={serverUrl} apiKey={apiKey} />;
      break;
    case "Activity":
      view = isAdmin
        ? <ActivityLogsView serverUrl={serverUrl} apiKey={apiKey} isAdmin={isAdmin} />
        : <WorkspaceView serverUrl={serverUrl} apiKey={apiKey} sessionId={null} />;
      break;
    default:
      view = <WorkspaceView serverUrl={serverUrl} apiKey={apiKey} sessionId={null} />;
  }

  return (
    <main className="flex-1 overflow-hidden">
      <Suspense fallback={ViewportFallback}>{view}</Suspense>
    </main>
  );
}
