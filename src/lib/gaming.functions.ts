import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------- Steam ----------
async function fetchSteam(steamId: string) {
  const key = process.env.STEAM_API_KEY;
  if (!key) throw new Error("STEAM_API_KEY не задан");
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`;
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Steam: ${res.status}. Проверь Steam ID (64-bit) и публичность профиля.`);
  const data = await res.json();
  const games = (data?.response?.games ?? []) as Array<{
    name: string;
    playtime_forever: number;
    appid: number;
  }>;
  const totalMinutes = games.reduce((s, g) => s + (g.playtime_forever || 0), 0);
  const top = [...games]
    .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
    .slice(0, 5)
    .map((g) => ({ name: g.name, hours: Math.round((g.playtime_forever || 0) / 60) }));
  return { totalMinutes, top };
}

// ---------- Faceit ----------
async function fetchFaceit(nickname: string) {
  const key = process.env.FACEIT_API_KEY;
  if (!key) throw new Error("FACEIT_API_KEY не задан");
  const headers = { Authorization: `Bearer ${key}` };

  const playerRes = await fetch(
    `https://open.faceit.com/data/v4/players?nickname=${encodeURIComponent(nickname)}`,
    { headers },
  );
  if (!playerRes.ok) throw new Error(`Faceit: игрок не найден (${playerRes.status})`);
  const player = await playerRes.json();
  const game = player?.games?.cs2 ?? player?.games?.csgo;
  const playerId = player?.player_id;
  if (!playerId) throw new Error("Faceit: не удалось получить player_id");

  // lifetime stats
  let kd: number | null = null;
  let winrate: number | null = null;
  type Recent = { competition: string | null; status: string | null; finished_at: number | null };
  let recent: Recent[] = [];
  try {
    const statsRes = await fetch(`https://open.faceit.com/data/v4/players/${playerId}/stats/cs2`, {
      headers,
    });
    if (statsRes.ok) {
      const stats = await statsRes.json();
      kd =
        parseFloat(stats?.lifetime?.["Average K/D Ratio"] ?? stats?.lifetime?.["K/D Ratio"]) ||
        null;
      winrate = parseFloat(stats?.lifetime?.["Win Rate %"]) || null;
    }
    const histRes = await fetch(
      `https://open.faceit.com/data/v4/players/${playerId}/history?game=cs2&limit=5`,
      { headers },
    );
    if (histRes.ok) {
      const hist = await histRes.json();
      recent = (hist?.items ?? []).map(
        (m: { competition_name?: string; status?: string; finished_at?: number }) => ({
          competition: m.competition_name ?? null,
          status: m.status ?? null,
          finished_at: m.finished_at ?? null,
        }),
      );
    }
  } catch {
    // Match history is optional; return the profile stats without it.
  }

  return {
    elo: game?.faceit_elo ?? null,
    level: game?.skill_level ?? null,
    kd,
    winrate,
    recent,
  };
}

export const syncGaming = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        steamId: z.string().trim().optional().nullable(),
        faceitNickname: z.string().trim().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // save identifiers
    await supabase.from("profiles").upsert({
      id: userId,
      steam_id: data.steamId?.trim() || null,
      faceit_nickname: data.faceitNickname?.trim() || null,
    });

    const result: {
      steam_total_minutes: number | null;
      steam_top_games: { name: string; hours: number }[] | null;
      faceit_elo: number | null;
      faceit_level: number | null;
      faceit_kd: number | null;
      faceit_winrate: number | null;
      faceit_recent:
        | { competition: string | null; status: string | null; finished_at: number | null }[]
        | null;
    } = {
      steam_total_minutes: null,
      steam_top_games: null,
      faceit_elo: null,
      faceit_level: null,
      faceit_kd: null,
      faceit_winrate: null,
      faceit_recent: null,
    };

    const errors: string[] = [];

    if (data.steamId?.trim()) {
      try {
        const s = await fetchSteam(data.steamId.trim());
        result.steam_total_minutes = s.totalMinutes;
        result.steam_top_games = s.top;
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    if (data.faceitNickname?.trim()) {
      try {
        const f = await fetchFaceit(data.faceitNickname.trim());
        result.faceit_elo = f.elo;
        result.faceit_level = f.level;
        result.faceit_kd = f.kd;
        result.faceit_winrate = f.winrate;
        result.faceit_recent = f.recent;
      } catch (e) {
        errors.push((e as Error).message);
      }
    }

    await supabase.from("gaming_stats").upsert({
      user_id: userId,
      ...result,
      last_synced_at: new Date().toISOString(),
    });

    return { ...result, errors };
  });
