import { supabase } from "@/integrations/supabase/client";
import { ensureRoutineInstances, localIso } from "@/lib/planner";

/**
 * «Что я ещё не сделал» — local notification on demand.
 * Scheduled reminders are Web Push from the server (see lib/push.ts).
 */

async function notify(tag: string, title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const options: NotificationOptions = {
    body,
    tag,
    icon: "/icon-192.png",
    badge: "/favicon-32.png",
    data: { url: "/app" },
  };
  const reg =
    "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/sw.js") : null;
  if (reg) return reg.showNotification(title, options);
  try {
    new Notification(title, options);
  } catch {
    // Some browsers only allow notifications through a service worker.
  }
}

async function loadPending() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const iso = localIso();
  // Today's routine instances may not exist yet if Plans wasn't opened today.
  await ensureRoutineInstances(iso, iso).catch(() => undefined);
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("user_id", u.user.id)
    .eq("scheduled_for", iso)
    .eq("completed", false)
    .eq("skipped", false)
    .order("scheduled_time", { nullsFirst: false });
  return tasks ?? [];
}

export async function remindNow() {
  const pending = await loadPending();
  if (pending.length === 0) {
    await notify("lumen-done", "Lumen", "Всё сделано на сегодня 🎉");
    return 0;
  }
  const titles = pending
    .slice(0, 5)
    .map((p) => "• " + p.title)
    .join("\n");
  await notify("lumen-now", `Осталось ${pending.length}`, titles);
  return pending.length;
}
