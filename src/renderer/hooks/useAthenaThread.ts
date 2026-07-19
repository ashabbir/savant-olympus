import { useCallback, useEffect, useMemo, useState } from "react";
import type { AthenaMessageModel } from "@/components/shared/AthenaMessage";

export interface AthenaThreadStore<TMessage extends AthenaMessageModel> {
  load(threadId: string): Promise<TMessage[]>;
  save(threadId: string, messages: TMessage[]): Promise<unknown>;
}

export function createSystemAthenaThreadStore<TMessage extends AthenaMessageModel>(): AthenaThreadStore<TMessage> {
  return {
    async load(threadId) {
      const threads = await window.system.loadAthenaThreads();
      const thread = Array.isArray(threads)
        ? threads.find((candidate: any) => candidate?.target_id === threadId)
        : null;
      return Array.isArray(thread?.messages) ? thread.messages : [];
    },
    save(threadId, messages) {
      return window.system.saveAthenaThread(threadId, messages);
    },
  };
}

export function readLocalAthenaHistory<TMessage extends AthenaMessageModel>(storageKey: string): Array<TMessage & { scope?: string }> {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createScopedLocalAthenaThreadStore<TMessage extends AthenaMessageModel>(
  storageKey: string,
  scope: string,
): AthenaThreadStore<TMessage> {
  return {
    async load() {
      return readLocalAthenaHistory<TMessage>(storageKey)
        .filter((message) => message.scope === scope || !message.scope)
        .map(({ scope: _scope, ...message }) => message as unknown as TMessage);
    },
    async save(_threadId, messages) {
      const otherScopes = readLocalAthenaHistory<TMessage>(storageKey)
        .filter((message) => message.scope && message.scope !== scope);
      localStorage.setItem(storageKey, JSON.stringify([
        ...otherScopes,
        ...messages.map((message) => ({ ...message, scope })),
      ]));
    },
  };
}

interface UseAthenaThreadOptions<TMessage extends AthenaMessageModel> {
  threadId: string;
  store?: AthenaThreadStore<TMessage>;
}

export function useAthenaThread<TMessage extends AthenaMessageModel>({
  threadId,
  store,
}: UseAthenaThreadOptions<TMessage>) {
  const activeStore = useMemo(() => store ?? createSystemAthenaThreadStore<TMessage>(), [store]);
  const [messages, setMessagesState] = useState<TMessage[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsHistoryLoading(true);
    activeStore.load(threadId)
      .then((loaded) => {
        if (active) setMessagesState(loaded);
      })
      .catch((error) => {
        console.error(`Failed to load Athena thread ${threadId}:`, error);
        if (active) setMessagesState([]);
      })
      .finally(() => {
        if (active) setIsHistoryLoading(false);
      });
    return () => { active = false; };
  }, [activeStore, threadId]);

  const setMessages = useCallback((next: TMessage[] | ((current: TMessage[]) => TMessage[])) => {
    setMessagesState((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      void activeStore.save(threadId, resolved).catch((error) => {
        console.error(`Failed to save Athena thread ${threadId}:`, error);
      });
      return resolved;
    });
  }, [activeStore, threadId]);

  const appendMessage = useCallback((message: TMessage) => {
    setMessages((current) => [...current, message]);
  }, [setMessages]);

  const removeMessage = useCallback((messageId: string) => {
    setMessages((current) => current.filter((message) => message.id !== messageId));
  }, [setMessages]);

  const clearMessages = useCallback(() => setMessages([]), [setMessages]);

  return { messages, setMessages, appendMessage, removeMessage, clearMessages, isHistoryLoading };
}
