import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { setStoredApiKey } from "../services/auth";

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  onProfileChanged?: () => void;
}

export function ProfileModal({ open, onClose, onProfileChanged }: ProfileModalProps) {
  const [name, setName] = useState("User");
  const [apiKey, setApiKey] = useState("");
  const backupRef = useRef<{ name: string; apiKey: string }>({ name: "User", apiKey: "" });

  useEffect(() => {
    if (open) {
      window.system.getSettings().then(settings => {
        const initialName = settings["user:name"] || "User";
        const initialApiKey = settings["user:apiKey"] || "";
        setName(initialName);
        setApiKey(initialApiKey);
        backupRef.current = { name: initialName, apiKey: initialApiKey };
      });
    }
  }, [open]);

  async function handleSaveLocal(currentName: string, currentApiKey: string) {
    await window.system.saveSetting("user:name", currentName.trim());
    await window.system.saveSetting("user:apiKey", currentApiKey.trim());
    setStoredApiKey(currentApiKey);
    onProfileChanged?.();
  }

  async function handleCancel() {
    await window.system.saveSetting("user:name", backupRef.current.name);
    await window.system.saveSetting("user:apiKey", backupRef.current.apiKey);
    setStoredApiKey(backupRef.current.apiKey);
    onProfileChanged?.();
    onClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{ background: "rgba(0, 0, 0, 0.7)" }}
          className="fixed inset-0 z-[100]"
        />
        <Dialog.Content
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            handleCancel();
          }}
          style={{
            background: "var(--cp-bg-2)",
            border: "1px solid var(--cp-border)",
            boxShadow: "0 0 20px rgba(0, 229, 255, 0.2)",
          }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90vw] max-w-md p-6"
        >
          {/* header */}
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title
              style={{
                color: "var(--cp-cyan)",
                fontFamily: "'Orbitron', sans-serif",
              }}
              className="text-lg font-medium"
            >
              Edit Profile
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                style={{ color: "var(--cp-cyan)" }}
                className="opacity-60 hover:opacity-100 transition-opacity"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description
            style={{
              color: "var(--foreground)",
              fontFamily: "'Rajdhani', sans-serif",
            }}
            className="text-sm opacity-60 mb-6"
          >
            Update your profile information and API credentials
          </Dialog.Description>

          {/* form */}
          <div className="space-y-4">
            <div>
              <label
                style={{
                  color: "var(--cp-cyan)",
                  fontFamily: "'Share Tech Mono', monospace",
                }}
                className="block text-xs mb-2 opacity-70"
              >
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onBlur={() => handleSaveLocal(name, apiKey)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    handleSaveLocal(name, apiKey);
                    onClose();
                  }
                }}
                style={{
                  background: "var(--cp-bg-3)",
                  border: "1px solid var(--cp-border)",
                  color: "var(--foreground)",
                  fontFamily: "'Rajdhani', sans-serif",
                }}
                className="w-full px-3 py-2 text-sm focus:outline-none focus:border-[var(--cp-cyan)]"
              />
            </div>

            <div>
              <label
                style={{
                  color: "var(--cp-cyan)",
                  fontFamily: "'Share Tech Mono', monospace",
                }}
                className="block text-xs mb-2 opacity-70"
              >
                Savant API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                onBlur={() => handleSaveLocal(name, apiKey)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    handleSaveLocal(name, apiKey);
                    onClose();
                  }
                }}
                placeholder="••••••••••••••••"
                style={{
                  background: "var(--cp-bg-3)",
                  border: "1px solid var(--cp-border)",
                  color: "var(--foreground)",
                  fontFamily: "'Share Tech Mono', monospace",
                }}
                className="w-full px-3 py-2 text-xs focus:outline-none focus:border-[var(--cp-cyan)]"
              />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
