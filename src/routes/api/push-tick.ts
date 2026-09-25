import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Database } from "@/integrations/supabase/types";

// Called every minute by a Supabase pg_cron job (see supabase/updates/).
// The database decides what is due (push_due) and holds the keys; this route
// only signs and delivers the pushes.
export const Route = createFileRoute("/api/push-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-cron-secret");
        if (!secret) return json({ error: "unauthorized" }, 401);

        const supabase = createClient<Database>(
          process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL,
          process.env.SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const keys = await getVapidKeys(supabase, secret);
        if ("error" in keys) return json({ error: keys.error }, 401);

        const { data: due, error } = await supabase.rpc("push_due", { p_secret: secret });
        if (error) return json({ error: error.message }, 500);

        const subject = new URL(request.url).origin.startsWith("https://")
          ? new URL(request.url).origin
          : "mailto:noreply@lumen.app";
        let sent = 0;
        let failed = 0;
        await Promise.all(
          (due ?? []).map(async (item) => {
            try {
              await webpush.sendNotification(
                { endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } },
                JSON.stringify({ title: item.title, body: item.body, tag: item.tag, url: "/app" }),
                {
                  TTL: 60 * 60,
                  urgency: "high",
                  vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
                },
              );
              sent++;
            } catch (err) {
              failed++;
              const status = (err as { statusCode?: number }).statusCode;
              // The device unsubscribed or the app was removed: forget it.
              if (status === 404 || status === 410)
                await supabase.rpc("push_remove_subscription", {
                  p_secret: secret,
                  p_endpoint: item.endpoint,
                });
              else console.error("push failed", status, err);
            }
          }),
        );
        return json({ sent, failed });
      },
    },
  },
});

async function getVapidKeys(
  supabase: ReturnType<typeof createClient<Database>>,
  secret: string,
  retry = true,
): Promise<{ publicKey: string; privateKey: string } | { error: string }> {
  const { data, error } = await supabase.rpc("push_keys", { p_secret: secret });
  if (error) return { error: error.message };
  const row = data?.[0];
  if (row?.vapid_public && row.vapid_private)
    return { publicKey: row.vapid_public, privateKey: row.vapid_private };
  if (!retry) return { error: "VAPID keys missing" };

  // First run: create the key pair and store it (only if still unset).
  const generated = webpush.generateVAPIDKeys();
  const { error: setError } = await supabase.rpc("push_set_keys", {
    p_secret: secret,
    p_public: generated.publicKey,
    p_private: generated.privateKey,
  });
  if (setError) return { error: setError.message };
  return getVapidKeys(supabase, secret, false);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
