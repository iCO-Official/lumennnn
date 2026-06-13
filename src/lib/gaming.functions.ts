import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function fetchSteam(steamId: string) {
  const key = process.env.STEAM_API_KEY;
  if (!key) throw new Error("STEAM_API_KEY не задан");
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamId}&include_played_free_games=1&include_appinfo=1&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam ${res.status}. Проверь SteamID (64-битный) и что профиль публичный.`);
  const data = await res.json();
  const games = (data?.response?.games ?? []) as { name: string; playtime_forever: number; appid: number }[];
  const total = games.reduce((s, g) => s + (g.playtime_forever || 0), 0);
  const top = [...games].sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 8)
    .map((g) => ({ name: g.name, hours: Math.round((g.playtime_forever || 0) / 60) }));
  return { totalMinutes: total, topGames: top };
}

async function fetchFaceit(nickname: string) {
  const key = process.env.FACEIT_API_KEY;
  if (!key) throw new Error("FACEIT_API_KEY не задан");
  const headers = { Authorization: `Bearer ${key}` };
  const p = await fetch(`https://open.faceit.com/data/v4/players?nickname=${encodeURIComponent(nickname)}`, { headers });
  if (!p.ok) throw new Error(`Faceit: игрок не найден (${p.status})`);
  const player = await p.json();
  const playerId = player.player_id as string;
  const game = player.games?.cs2 ? "cs2" : "csgo";
  const elo = player.games?.[game]?.faceit_elo ?? null;
  const level = player.games?.[game]?.skill_level ?? null;

  const sRes = await fetch(`https://open.faceit.com/data/v4/players/${playerId}/stats/${game}`, { headers });
  const stats = sRes.ok ? await sRes.json() : null;
  const kd = stats?.lifetime?.["Average K/D Ratio"] ? Number(stats.lifetime["Average K/D Ratio"]) : null;
  const winrate = stats?.lifetime?.["Win Rate %"] ? Number(stats.lifetime["Win Rate %"]) : null;

  const hRes = await fetch(`https://open.faceit.com/data/v4/players/${playerId}/history?game=${game}&limit=10`, { headers });
  const history = hRes.ok ? await hRes.json() : { items: [] };
  const recent = (history.items ?? []).map((m: { match_id: string; finished_at: number; results?: { winner: string }; teams?: Record<string, { nickname: string; players?: { player_id: string }[] }> }) => ({
    match_id: m.match_id,
    finished_at: m.finished_at,
    winner: m.results?.winner ?? null,
  }));

  return { elo, level, kd, winrate, recent };
}

export const syncGaming = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("steam_id, faceit_nickname").eq("id", userId).maybeSingle();

    const update: Record<string, unknown> = { user_id: userId, last_synced_at: new Date().toISOString() };
    const errors: string[] = [];

    if (profile?.steam_id) {
      try {
        const s = await fetchSteam(profile.steam_id);
        update.steam_total_minutes = s.totalMinutes;
        update.steam_top_games = s.topGames;
      } catch (e) { errors.push(e instanceof Error ? e.message : "Steam ошибка"); }
    }
    if (profile?.faceit_nickname) {
      try {
        const f = await fetchFaceit(profile.faceit_nickname);
        update.faceit_elo = f.elo;
        update.faceit_level = f.level;
        update.faceit_kd = f.kd;
        update.faceit_winrate = f.winrate;
        update.faceit_recent = f.recent;
      } catch (e) { errors.push(e instanceof Error ? e.message : "Faceit ошибка"); }
    }

    const { error } = await supabase.from("gaming_stats").upsert(update);
    if (error) throw new Error(error.message);
    return { ok: true, errors };
  });

export const saveGamingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      steam_id: z.string().trim().max(32).nullable(),
      faceit_nickname: z.string().trim().max(64).nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("profiles")
      .update({ steam_id: data.steam_id || null, faceit_nickname: data.faceit_nickname || null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
