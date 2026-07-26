import {
  Settings, User, LogOut, UserCog,
  Briefcase, Network, Search, Wrench, Award, Cpu, Users, Bell, ScrollText
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ProfileModal } from "./ProfileModal";
import { SettingsModal } from "./SettingsModal";
import { useState } from "react";

interface LeftSidebarProps {
  onSettingsChanged: () => void;
  onLogout: () => void;
  activeTab: string;
  onChangeTab: (tab: string) => void;
  isAdmin?: boolean;
}

function NavIcon({
  icon, label, onClick, isActive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  isActive?: boolean;
}) {
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={onClick}
            title={label}
            style={{
              color: "var(--cp-cyan)",
              opacity: isActive ? 1 : 0.45,
              borderRight: isActive ? "2px solid var(--cp-cyan)" : "2px solid transparent",
            }}
            className="w-10 h-10 flex items-center justify-center hover:opacity-100 transition-all cursor-pointer"
          >
            {icon}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            style={{
              background: "var(--cp-bg-3)",
              border: "1px solid var(--cp-border)",
              color: "var(--cp-cyan)",
              fontFamily: "'Share Tech Mono', monospace",
            }}
            className="px-2 py-1 text-xs z-50"
          >
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

const TAB_ITEMS = [
  { id: "Workspace", label: "Workspace", icon: <Briefcase size={16} /> },
  { id: "Knowledge", label: "Knowledge", icon: <Network size={16} /> },
  { id: "Context", label: "Context", icon: <Search size={16} /> },
  { id: "Tools", label: "Tools", icon: <Wrench size={16} /> },
  { id: "Skills", label: "Skills", icon: <Award size={16} /> },
  { id: "Abilities", label: "Abilities", icon: <Cpu size={16} /> },
  { id: "Users", label: "Users", icon: <Users size={16} /> },
  { id: "Reminders", label: "Reminders", icon: <Bell size={16} /> },
  { id: "Activity", label: "Activity Log", icon: <ScrollText size={16} /> },
];

export function LeftSidebar({ onSettingsChanged, onLogout, activeTab, onChangeTab, isAdmin }: LeftSidebarProps) {
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const visibleTabs = TAB_ITEMS.filter((tab) => !["Users", "Activity"].includes(tab.id) || isAdmin);

  return (
    <aside
      style={{
        background: "var(--cp-bg-1)",
        borderRight: "1px solid var(--cp-border)",
        display: "flex",
        flexDirection: "row",
      }}
      className="h-full shrink-0"
    >
      <div
        style={{ borderRight: "1px solid var(--cp-border)", width: 40 }}
        className="flex flex-col justify-between py-2 shrink-0"
      >
        <div className="flex flex-col items-center gap-1">
          {visibleTabs.map((tab) => (
            <NavIcon
              key={tab.id}
              icon={tab.icon}
              label={tab.label}
              onClick={() => onChangeTab(tab.id)}
              isActive={activeTab === tab.id}
            />
          ))}
        </div>
        <div className="flex flex-col items-center gap-1">
          <NavIcon
            icon={<Settings size={14} />}
            label="settings"
            onClick={() => setSettingsModalOpen(true)}
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                title="Logout"
                style={{ color: "var(--cp-cyan)", opacity: 0.45 }}
                className="w-10 h-10 flex items-center justify-center hover:opacity-100 transition-all cursor-pointer"
              >
                <LogOut size={14} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                side="right"
                align="end"
                style={{
                  background: "#0a0e18",
                  border: "1px solid rgba(0, 229, 255, 0.16)",
                  boxShadow: "0 20px 40px rgba(0, 0, 0, 0.45)",
                }}
                className="min-w-[140px] z-50 p-2 flex flex-col gap-1.5"
              >
                <DropdownMenu.Item
                  onClick={() => setProfileModalOpen(true)}
                  style={{
                    color: "var(--foreground)",
                    fontFamily: "'Share Tech Mono', monospace",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                  }}
                  className="px-3 py-2 text-xs cursor-pointer outline-none flex items-center gap-2 hover:bg-[rgba(0,229,255,0.06)] hover:border-[rgba(0,229,255,0.28)] transition-all"
                >
                  <UserCog size={12} style={{ color: "var(--cp-cyan)" }} />
                  Edit Profile
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onClick={onLogout}
                  style={{
                    color: "var(--foreground)",
                    fontFamily: "'Share Tech Mono', monospace",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                  }}
                  className="px-3 py-2 text-xs cursor-pointer outline-none flex items-center gap-2 hover:bg-[rgba(255,0,170,0.06)] hover:border-[rgba(255,0,170,0.28)] transition-all"
                >
                  <LogOut size={12} style={{ color: "var(--cp-magenta)" }} />
                  Logout
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      <ProfileModal open={profileModalOpen} onClose={() => setProfileModalOpen(false)} onProfileChanged={onSettingsChanged} />
      <SettingsModal open={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} onSettingsChanged={onSettingsChanged} />
    </aside>
  );
}
