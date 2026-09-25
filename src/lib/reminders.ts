import { supabase } from "@/integrations/supabase/client";
import { ensureRoutineInstances } from "@/lib/planner";

/**
 * Напоминания о невыполненных делах.
 * Уведомления показываются через service worker, поэтому они «висят»
 * в центре уведомлений, пока пользователь их не закроет.
 */

const CHECK_MS = 60_000;
// В какие часы напоминать про весь список несделанного
const SUMMARY_HOURS = [9, 13, 18, 21];

let timer: ReturnType<typeof setInterval> | null = null;

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function firedKey(key: string) {
  return `lumen-notified-${todayIso()}-${key}`;
}

function alreadyFired(key: string) {
  try {
    return localStorage.getItem(firedKey(key)) === "1";
  } catch {
    return false;
  }
}

function markFired(key: string) {
  try {
    localStorage.setItem(firedKey(key), "1");
  } catch {
    /* ignore */
  }
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/sw.js");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

async function notify(tag: string, title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const options: NotificationOptions & { requireInteraction?: boolean; renotify?: boolean } = {
    body,
    tag,
    icon: "/icon-192.png",
    badge: "/favicon-32.png",
    requireInteraction: true,
    renotify: true,
    data: { url: "/app" },
  };
  const reg = await getRegistration();
  if (reg) {
    await reg.showNotification(title, options);
    return;
  }
  try {
    new Notification(title, options);
  } catch {
    /* ignore */
  }
}

type Pending = { id: string; title: string; time: string | null };

async function loadPending(): Promise<Pending[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const iso = todayIso();
  // Today's routine instances may not exist yet if Plans wasn't opened today.
  await ensureRoutineInstances(iso, iso).catch(() => undefined);

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, completed, scheduled_time, scheduled_for")
    .eq("user_id", u.user.id)
    .eq("scheduled_for", iso)
    .eq("completed", false)
    .eq("skipped", false);

  if (!tasks || tasks.length === 0) return [];

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    time: t.scheduled_time,
  }));
}

function minutesOf(time: string) {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

async function tick() {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  let pending: Pending[] = [];
  try {
    pending = await loadPending();
  } catch {
    return;
  }
  if (pending.length === 0) return;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // 1) Точечные напоминания по времени дела
  for (const p of pending) {
    if (!p.time) continue;
    const start = minutesOf(p.time);
    if (Number.isNaN(start)) continue;
    // окно: с момента начала и следующие 10 минут
    if (nowMin >= start && nowMin <= start + 10 && !alreadyFired("task-" + p.id)) {
      markFired("task-" + p.id);
      await notify("lumen-task-" + p.id, "Lumen · пора", p.title);
    }
    // просрочено больше чем на час — напомним ещё раз
    if (nowMin > start + 60 && !alreadyFired("late-" + p.id)) {
      markFired("late-" + p.id);
      await notify(
        "lumen-late-" + p.id,
        "Lumen · ещё не сделано",
        `${p.title} — было на ${p.time}`,
      );
    }
  }

  // 2) Сводка по несделанному несколько раз в день
  const hour = now.getHours();
  if (SUMMARY_HOURS.includes(hour) && !alreadyFired("summary-" + hour)) {
    markFired("summary-" + hour);
    const titles = pending
      .slice(0, 3)
      .map((p) => p.title)
      .join(", ");
    const more = pending.length > 3 ? ` и ещё ${pending.length - 3}` : "";
    await notify("lumen-summary", `Lumen · осталось ${pending.length}`, `${titles}${more}`);
  }
}

/** Запускает фоновую проверку напоминаний (идемпотентно). */
export async function scheduleRoutineReminders() {
  if (typeof window === "undefined") return;
  await getRegistration();
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    void tick();
  }, CHECK_MS);
  await tick();
}

export function stopRoutineReminders() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Мгновенное напоминание «что осталось» — по кнопке. */
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
