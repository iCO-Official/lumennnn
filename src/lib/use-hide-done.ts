import { useCallback, useEffect, useState } from "react";

const KEY = "lumen-hide-done";
const EVENT = "lumen:hide-done";

function read() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** "Свернуть выполненные": remembered per device, shared by Home and Plans. */
export function useHideDone() {
  const [hideDone, setHideDone] = useState(read);
  useEffect(() => {
    const sync = () => setHideDone(read());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const toggle = useCallback(() => {
    const next = !read();
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // Private mode: works until reload.
    }
    setHideDone(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [hideDone, toggle] as const;
}
