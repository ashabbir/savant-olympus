export const SAVANT_API_KEY_STORAGE_KEY = "savant_api_key";

export function getStoredApiKey() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(SAVANT_API_KEY_STORAGE_KEY) || "";
}

export function setStoredApiKey(apiKey: string) {
  if (typeof window === "undefined") return;
  const trimmed = apiKey.trim();
  if (trimmed) {
    window.localStorage.setItem(SAVANT_API_KEY_STORAGE_KEY, trimmed);
  } else {
    window.localStorage.removeItem(SAVANT_API_KEY_STORAGE_KEY);
  }
}

export function clearStoredApiKey() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SAVANT_API_KEY_STORAGE_KEY);
}
