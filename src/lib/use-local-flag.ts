import { useCallback, useEffect, useState } from "react";

const EVENT = "lumen:local-flag";

export function readLocalFlag(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** A per-device on/off setting, kept in sync across every component using it. */
export function useLocalFlag(key: string) {
  const [value, setValue] = useState(() => readLocalFlag(key));
  useEffect(() => {
    const sync = () => setValue(readLocalFlag(key));
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [key]);
  const set = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Private mode: works until reload.
      }
      setValue(next);
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set] as const;
}

/** "Свернуть выполненные": shared by Home and Plans. */
export function useHideDone() {
  const [hideDone, setHideDone] = useLocalFlag("lumen-hide-done");
  const toggle = useCallback(() => setHideDone(!readLocalFlag("lumen-hide-done")), [setHideDone]);
  return [hideDone, toggle] as const;
}

/** Apply AI proposals right away instead of asking for confirmation. */
export const AI_AUTO_APPLY_KEY = "lumen-ai-auto-apply";
