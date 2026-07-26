import { AbilitiesView } from "./tabs/AbilitiesView";
import { ContextView } from "./tabs/ContextView";
import { KnowledgeView } from "./tabs/KnowledgeView";
import { RemindersView } from "./tabs/RemindersView";
import { SkillsView } from "./tabs/SkillsView";
import { ToolsView } from "./tabs/ToolsView";
import { UsersView } from "./tabs/UsersView";
import { WorkspaceView } from "./tabs/WorkspaceView";
import { ActivityLogsView } from "./tabs/ActivityLogsView";
import type { OlympusModel } from "@/services/olympusRuntime";

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

  return <main className="flex-1 overflow-hidden">{view}</main>;
}
