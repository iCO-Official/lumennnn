import { supabase } from "@/integrations/supabase/client";

// Web Push subscription for this device. Reminders themselves are sent by the
// server (api/push-tick), so they arrive even when the app is closed.

export type PushStatus =
  | "unsupported" // no Push API (e.g. iOS Safari tab — needs Home Screen app)
  | "needs-install" // iOS: must be opened from the Home Screen
  | "denied"
  | "off"
  | "on";

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration() {
  return (
    (await navigator.serviceWorker.getRegistration("/sw.js")) ??
    (await navigator.serviceWorker.register("/sw.js"))
  );
}

export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsupported";
  if (!pushSupported()) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const sub = await (await registration()).pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function base64UrlToBytes(value: string) {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Asks for permission (must run from a tap) and registers this device. */
export async function enablePush() {
  const status = await getPushStatus();
  if (status === "needs-install")
    throw new Error(
      "Добавь Lumen на экран «Домой» и открой оттуда — iPhone присылает уведомления только так",
    );
  if (status === "unsupported") throw new Error("Этот браузер не поддерживает уведомления");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Разреши уведомления для Lumen в настройках");

  const { data: publicKey, error } = await supabase.rpc("push_public_key");
  if (error) throw error;
  if (!publicKey) throw new Error("Сервер уведомлений ещё запускается — попробуй через минуту");

  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub)
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    });
  await saveSubscription(sub);
}

async function saveSubscription(sub: PushSubscription) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Войди в аккаунт");
  const json = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: u.user.id,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
    { onConflict: "endpoint" },
  );
  if (error) throw error;
}

/** Keeps the stored timezone/keys fresh; call on app start. */
export async function syncPushSubscription() {
  if ((await getPushStatus()) !== "on") return;
  const sub = await (await registration()).pushManager.getSubscription();
  if (sub) await saveSubscription(sub).catch(() => undefined);
}

export async function disablePush() {
  if (!pushSupported()) return;
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

/** The server sends a test notification to this device within a minute. */
export async function requestTestPush() {
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) throw new Error("Уведомления на этом устройстве выключены");
  const { error } = await supabase
    .from("push_subscriptions")
    .update({ test_requested: true })
    .eq("endpoint", sub.endpoint);
  if (error) throw error;
}
