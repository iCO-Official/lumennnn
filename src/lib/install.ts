import { useEffect, useReducer } from "react";

// Chrome / Edge (desktop and Android) offer "install this site as an app" via
// beforeinstallprompt. Catch it as early as possible and keep it for our own
// "Install" button instead of the browser's mini-infobar.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

/** Running as an installed app (Home Screen / desktop window), not in a browser tab. */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Returns a function that opens the browser's install dialog, or null when unavailable. */
export function useInstallPrompt() {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);
  if (!deferred) return null;
  return async () => {
    const event = deferred;
    if (!event) return;
    await event.prompt();
    await event.userChoice.catch(() => null);
    deferred = null;
    notify();
  };
}
