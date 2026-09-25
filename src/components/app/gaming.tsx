import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { syncGaming } from "@/lib/gaming.functions";
import { Card, Empty, Loader, Stat, formatDate } from "./shared";

type GamingStats = {
  steam_total_minutes: number | null;
  steam_top_games: { name: string; hours: number }[] | null;
  faceit_elo: number | null;
  faceit_level: number | null;
  faceit_kd: number | null;
  faceit_winrate: number | null;
  faceit_recent:
    | { competition: string | null; status: string | null; finished_at: number | null }[]
    | null;
  last_synced_at: string | null;
};

export function GamingSection() {
  const sync = useServerFn(syncGaming);
  const [steamId, setSteamId] = useState("");
  const [faceit, setFaceit] = useState("");
  const [stats, setStats] = useState<GamingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const [{ data: profile }, { data: gs }] = await Promise.all([
      supabase
        .from("profiles")
        .select("steam_id, faceit_nickname")
        .eq("id", u.user.id)
        .maybeSingle(),
      supabase.from("gaming_stats").select("*").eq("user_id", u.user.id).maybeSingle(),
    ]);
    setSteamId(profile?.steam_id ?? "");
    setFaceit(profile?.faceit_nickname ?? "");
    setStats((gs as GamingStats | null) ?? null);
    setLoading(false);
  }

  async function run() {
    setSyncing(true);
    try {
      const r = await sync({ data: { steamId: steamId || null, faceitNickname: faceit || null } });
      if (r.errors?.length) r.errors.forEach((e) => toast.error(e));
      else toast.success("Синхронизировано");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <Loader />;

  const steamHours =
    stats?.steam_total_minutes != null ? Math.round(stats.steam_total_minutes / 60) : null;

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 text-sm text-muted-foreground">
          Подключи аккаунты — AI будет видеть статистику.
        </div>
        <div className="mb-3">
          <div className="mb-1 text-xs text-muted-foreground">Steam ID (64-bit)</div>
          <input
            value={steamId}
            onChange={(e) => setSteamId(e.target.value)}
            placeholder="76561198..."
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-foreground"
          />
        </div>
        <div className="mb-3">
          <div className="mb-1 text-xs text-muted-foreground">Faceit nickname</div>
          <input
            value={faceit}
            onChange={(e) => setFaceit(e.target.value)}
            placeholder="ник"
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-foreground"
          />
        </div>
        <button
          onClick={run}
          disabled={syncing}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40"
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {syncing ? "Синхронизирую…" : "Синхронизировать"}
        </button>
        {stats?.last_synced_at && (
          <div className="mt-2 text-center text-xs text-muted-foreground">
            Обновлено {formatDate(stats.last_synced_at)}
          </div>
        )}
      </div>

      {(steamHours != null || stats?.steam_top_games?.length) && (
        <Card title="Steam">
          {steamHours != null && (
            <div className="mb-3 flex items-baseline gap-2">
              <span className="font-serif text-3xl">{steamHours}</span>
              <span className="text-sm text-muted-foreground">часов всего</span>
            </div>
          )}
          {stats?.steam_top_games?.length ? (
            <ul className="space-y-1.5">
              {stats.steam_top_games.map((g, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2">{g.name}</span>
                  <span className="text-muted-foreground tabular-nums">{g.hours} ч</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      )}

      {(stats?.faceit_elo != null || stats?.faceit_kd != null) && (
        <div className="mt-4">
          <Card title="Faceit · CS2">
            <div className="grid grid-cols-2 gap-3">
              {stats.faceit_elo != null && <Stat label="ELO" value={String(stats.faceit_elo)} />}
              {stats.faceit_level != null && (
                <Stat label="Уровень" value={String(stats.faceit_level)} />
              )}
              {stats.faceit_kd != null && <Stat label="K/D" value={stats.faceit_kd.toFixed(2)} />}
              {stats.faceit_winrate != null && (
                <Stat label="Winrate" value={`${stats.faceit_winrate}%`} />
              )}
            </div>
            {stats.faceit_recent?.length ? (
              <div className="mt-4">
                <div className="mb-2 text-xs text-muted-foreground">Последние матчи</div>
                <ul className="space-y-1 text-xs">
                  {stats.faceit_recent.slice(0, 5).map((m, i) => (
                    <li key={i} className="flex items-center justify-between text-muted-foreground">
                      <span className="truncate pr-2">{m.competition ?? "—"}</span>
                      <span>{m.status ?? ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        </div>
      )}

      {!stats?.steam_total_minutes && !stats?.faceit_elo && (
        <Empty text="Введи Steam ID или Faceit ник и нажми синхронизировать." />
      )}
    </div>
  );
}
