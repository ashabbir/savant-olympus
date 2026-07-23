import { useCallback } from "react";
import { reportKnowledgeError } from "../utils/errors";

export function useKnowledgeGraphActions(setLoading: (loading: boolean) => void) {
  const runGraphAction = useCallback(async <T,>(
    action: string,
    operation: () => Promise<T>,
    onError: (message: string) => void = (message) => alert(message),
  ) => {
    setLoading(true);
    try {
      return await operation();
    } catch (error) {
      onError(reportKnowledgeError(action, error));
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  return { runGraphAction };
}
