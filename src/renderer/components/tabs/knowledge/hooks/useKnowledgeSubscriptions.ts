import { useEffect, useRef } from "react";

interface KnowledgeKeyboardActions {
  fitToGraph: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  clearExploreMode: () => void;
}

interface KnowledgeEventActions {
  reload: () => void;
  openAddNode: () => void;
  commitAll: () => void;
  purge: () => void;
  upload: () => void;
  download: () => void;
  openChatHistory: () => void;
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useKnowledgeKeyboardShortcuts(actions: KnowledgeKeyboardActions) {
  const actionsRef = useLatest(actions);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      const action = ({
        f: actionsRef.current.fitToGraph,
        F: actionsRef.current.fitToGraph,
        "+": actionsRef.current.zoomIn,
        "=": actionsRef.current.zoomIn,
        "-": actionsRef.current.zoomOut,
        Escape: actionsRef.current.clearExploreMode,
      } as Record<string, (() => void) | undefined>)[event.key];
      action?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionsRef]);
}

export function useKnowledgeEventSubscriptions(actions: KnowledgeEventActions) {
  const actionsRef = useLatest(actions);

  useEffect(() => {
    const subscriptions = [
      ["knowledge-reload", "reload"],
      ["knowledge-add-node", "openAddNode"],
      ["knowledge-commit-all", "commitAll"],
      ["knowledge-purge", "purge"],
      ["knowledge-upload", "upload"],
      ["knowledge-download", "download"],
      ["knowledge-chat-history", "openChatHistory"],
    ] as const;
    const listeners = subscriptions.map(([eventName, actionName]) => {
      const listener = () => actionsRef.current[actionName]();
      window.addEventListener(eventName, listener);
      return [eventName, listener] as const;
    });

    return () => {
      listeners.forEach(([eventName, listener]) => window.removeEventListener(eventName, listener));
    };
  }, [actionsRef]);
}
