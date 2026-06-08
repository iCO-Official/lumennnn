import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

type Msg = { role: "system" | "user" | "assistant"; content: string };

async function callGateway(messages: Msg[]): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY не задан");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: MODEL, messages }),
  });
  if (res.status === 429) throw new Error("Слишком много запросов. Попробуй позже.");
  if (res.status === 402) throw new Error("Закончились AI-кредиты на воркспейсе.");
  if (!res.ok) throw new Error(`AI Gateway: ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

function friendSystemPrompt(name: string | null, age: number | null, gender: string | null) {
  const ctx: string[] = [];
  if (name) ctx.push(`Имя: ${name}`);
  if (age) ctx.push(`Возраст: ${age}`);
  if (gender) ctx.push(`Пол: ${gender}`);
  return `Ты — Lumen, личный AI-друг, который помогает пользователю в его дневнике. Общайся как близкий друг: тепло, на «ты», без формальностей, без канцелярита, без "Как я могу помочь?".

Стиль:
- короткие живые фразы, минимум воды;
- иногда лёгкий юмор, но не клоунада;
- слушай и задавай уточняющие вопросы, а не сразу советы;
- даёшь конкретику, а не общие слова;
- не используй emoji-спам, максимум 1 эмодзи на сообщение и не всегда;
- отвечай на том языке, на котором пишет пользователь (обычно русский).

${ctx.length ? "Что ты знаешь о собеседнике:\n" + ctx.join("\n") : ""}`;
}

export const chatWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ message: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: profile }, { data: history }] = await Promise.all([
      supabase.from("profiles").select("display_name, age, gender").eq("id", userId).maybeSingle(),
      supabase
        .from("ai_messages")
        .select("role, content")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(40),
    ]);

    const system = friendSystemPrompt(
      profile?.display_name ?? null,
      profile?.age ?? null,
      profile?.gender ?? null,
    );

    const messages: Msg[] = [
      { role: "system", content: system },
      ...((history ?? []) as Msg[]),
      { role: "user", content: data.message },
    ];

    const reply = await callGateway(messages);

    await supabase.from("ai_messages").insert([
      { user_id: userId, role: "user", content: data.message },
      { user_id: userId, role: "assistant", content: reply },
    ]);

    return { reply };
  });

export const resetAiChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("ai_messages").delete().eq("user_id", context.userId);
    return { ok: true };
  });

export const parsePlanText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    text: z.string().min(1).max(4000),
    scope: z.enum(["day", "week", "month"]).default("day"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const prompt = `Тебе дан свободный текст плана от пользователя. Извлеки конкретные задачи как короткие пункты (без нумерации). Верни строго JSON-массив строк, без markdown, без пояснений. Пример: ["Тренировка 18:00","Купить продукты","Прочитать главу"]

Текст:
"""
${data.text}
"""`;

    const reply = await callGateway([
      { role: "system", content: "Ты возвращаешь только валидный JSON-массив строк." },
      { role: "user", content: prompt },
    ]);

    let titles: string[] = [];
    try {
      const cleaned = reply.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) titles = parsed.filter((s) => typeof s === "string" && s.trim()).map((s: string) => s.trim()).slice(0, 30);
    } catch {
      // fallback: split lines
      titles = reply.split("\n").map((s) => s.replace(/^[-*\d.\s)]+/, "").trim()).filter(Boolean).slice(0, 30);
    }

    if (titles.length === 0) return { inserted: 0, tasks: [] };

    const rows = titles.map((title) => ({ user_id: userId, title, scope: data.scope }));
    const { data: inserted, error } = await supabase.from("tasks").insert(rows).select("id, title, scope, completed, scheduled_for");
    if (error) throw new Error(error.message);
    return { inserted: inserted?.length ?? 0, tasks: inserted ?? [] };
  });


  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceIso = since.toISOString().slice(0, 10);

    const [tasks, sleep, workouts, health, journal, profile] = await Promise.all([
      supabase.from("tasks").select("title, scope, completed, scheduled_for").eq("user_id", userId).gte("scheduled_for", sinceIso),
      supabase.from("sleep_logs").select("log_date, hours, quality").eq("user_id", userId).gte("log_date", sinceIso),
      supabase.from("workouts").select("title, kind, duration_min, intensity, workout_date").eq("user_id", userId).gte("workout_date", sinceIso),
      supabase.from("health_logs").select("log_date, mood, energy, water_ml, steps, weight_kg").eq("user_id", userId).gte("log_date", sinceIso),
      supabase.from("journal_entries").select("entry_date, mood, content").eq("user_id", userId).gte("entry_date", sinceIso),
      supabase.from("profiles").select("display_name, age, gender").eq("id", userId).maybeSingle(),
    ]);

    const summary = {
      tasks: tasks.data ?? [],
      sleep: sleep.data ?? [],
      workouts: workouts.data ?? [],
      health: health.data ?? [],
      journal: journal.data ?? [],
    };

    const system = friendSystemPrompt(
      profile.data?.display_name ?? null,
      profile.data?.age ?? null,
      profile.data?.gender ?? null,
    );

    const userPrompt = `Проанализируй мою неделю как друг. Вот данные в JSON:

${JSON.stringify(summary, null, 2)}

Дай короткий разбор:
1. Что получилось хорошо
2. Где я просел
3. 3 конкретных действия на следующую неделю

Без воды, по делу, на «ты». Без markdown-заголовков, просто абзацы.`;

    const reply = await callGateway([
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ]);

    return { analysis: reply };
  });
