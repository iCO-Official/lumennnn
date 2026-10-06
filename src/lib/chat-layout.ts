import { useCallback, useSyncExternalStore } from "react";

// Wide screens only: how the AI chat sits next to the app. Remembered per device.
export type ChatLayout = {
  mode: "dock" | "float" | "hidden";
  /** Docked panel width. */
  width: number;
  /** Floating window box. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where "show" returns to after hiding. */
  last: "dock" | "float";
};

export const WIDE_QUERY = "(min-width: 1280px)";
export const DOCK_MIN = 320;
export const FLOAT_MIN = { w: 320, h: 380 };
const KEY = "lumen-chat-layout";

const DEFAULT: ChatLayout = {
  mode: "dock",
  width: 400,
  x: -1, // -1 = place near the bottom-right corner on first use
  y: -1,
  w: 400,
  h: 560,
  last: "dock",
};

let state: ChatLayout = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved && typeof saved === "object") state = { ...DEFAULT, ...saved };
  } catch {
    // ignore broken / blocked storage
  }
}

/** Largest docked width that still leaves room for the sidebar and some content. */
export function maxDockWidth() {
  return Math.max(DOCK_MIN, Math.min(900, window.innerWidth - 240 - 520));
}

export function setChatLayout(patch: Partial<ChatLayout>) {
  load();
  state = { ...state, ...patch };
  if (patch.mode && patch.mode !== "hidden") state.last = patch.mode;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // private mode: not remembered
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot() {
  load();
  return state;
}

export function useChatLayout() {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT);
}

export function useMediaQuery(query: string) {
  const sub = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    sub,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function getChatLayout() {
  return snapshot();
}
