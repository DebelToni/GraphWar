import { SAVE_KEY } from "./constants.js";

export function loadSavedState() {
  const current = readKey(SAVE_KEY);
  if (current) return current;

  const legacy = readKey("graphwar-local-v1");
  if (legacy) {
    legacy.version = 2;
    return legacy;
  }

  return null;
}

export function saveState(payload) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ ...payload, version: 2, savedAt: Date.now() }));
}

export function clearSavedState() {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem("graphwar-local-v1");
}

function readKey(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
