import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

type Msg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type GwChoice = { message: { content: string | null; tool_calls?: ToolCall[] } };

async function rawGateway(messages: Msg[], tools?: unknown[]): Promise<GwChoice["message"]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY не задан");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: MODEL, messages, ...(tools ? { tools } : {}) }),
  });
  if (res.status === 429) throw new Error("Слишком много запросов. Попробуй позже.");
  if (res.status === 402) throw new Error("Закончились AI-кредиты на воркспейсе.");
  if (!res.ok) throw new Error(`AI Gateway: ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message ?? { content: "" };
}

async function callGateway(messages: Msg[]): Promise<string> {
  const m = await rawGateway(messages);
  return m.content ?? "";
}


function friendSystemPrompt(
  name: string | null,
  age: number | null,
  gender: string | null,
  interests: string[] | null,
  extras: { gaming?: unknown; metrics?: { name: string; unit: string | null }[] } = {},
) {
  const ctx: string[] = [];
  if (name) ctx.push(`Имя: ${name}`);
  if (age) ctx.push(`Возраст: ${age}`);
  if (gender) ctx.push(`Пол: ${gender}`);
  if (interests?.length) ctx.push(`Интересы: ${interests.join(", ")}`);
  if (extras.metrics?.length) ctx.push(`Личные метрики: ${extras.metrics.map((m) => m.name + (m.unit ? ` (${m.unit})` : "")).join(", ")}`);
  if (extras.gaming) ctx.push(`Игровая статистика: ${JSON.stringify(extras.gaming)}`);

  return `Ты — Lumen, личный AI-друг, который помогает пользователю в его дневнике. Общайся как близкий друг: тепло, на «ты», без формальностей, без канцелярита, без "Как я могу помочь?".

Стиль:
- короткие живые фразы, минимум воды;
- иногда лёгкий юмор, но не клоунада;
- слушай и задавай уточняющие вопросы, а не сразу советы;
- даёшь конкретику, а не общие слова;
- не используй emoji-спам, максимум 1 эмодзи на сообщение и не всегда;
- отвечай на том языке, на котором пишет пользователь (обычно русский);
- анализируй абсолютно все данные пользователя — сон, тренировки, здоровье, игры, кастомные метрики, дневник.

${ctx.length ? "Что ты знаешь о собеседнике:\n" + ctx.join("\n") : ""}`;
}

export const chatWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ message: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: profile }, { data: history }, { data: gaming }, { data: metrics }] = await Promise.all([
      supabase.from("profiles").select("display_name, age, gender, interests").eq("id", userId).maybeSingle(),
      supabase
        .from("ai_messages")
        .select("role, content")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(40),
      supabase.from("gaming_stats").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("custom_metrics").select("name, unit").eq("user_id", userId),
    ]);

    const system = friendSystemPrompt(
      profile?.display_name ?? null,
      profile?.age ?? null,
      profile?.gender ?? null,
      profile?.interests ?? null,
      { gaming: gaming ?? null, metrics: metrics ?? [] },
    );

    const messages: Msg[] = [
      { role: "system", content: system + "\n\n" + ROUTINE_TOOLS_HINT },
      ...((history ?? []) as Msg[]),
      { role: "user", content: data.message },
    ];

    let reply = "";
    for (let step = 0; step < 5; step++) {
      const m = await rawGateway(messages, ROUTINE_TOOLS);
      if (m.tool_calls?.length) {
        messages.push({ role: "assistant", content: m.content ?? "", tool_calls: m.tool_calls });
        for (const call of m.tool_calls) {
          let result: unknown;
          try {
            result = await runRoutineTool(supabase, userId, call.function.name, JSON.parse(call.function.arguments || "{}"));
          } catch (e) {
            result = { error: e instanceof Error ? e.message : "ошибка" };
          }
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
        continue;
      }
      reply = m.content ?? "";
      break;
    }
    if (!reply) reply = "Готово.";

    await supabase.from("ai_messages").insert([
      { user_id: userId, role: "user", content: data.message },
      { user_id: userId, role: "assistant", content: reply },
    ]);

    return { reply };
  });

const ROUTINE_TOOLS_HINT = `У тебя есть полный доступ к расписанию (рутине) пользователя через инструменты.
Если он просит составить/поменять/убрать дела в расписании — сразу используй инструменты, не спрашивай лишнего.
day_of_week: 0=воскресенье … 6=суббота, null = каждый день. Время в формате HH:MM или null.
После изменений коротко скажи, что именно сделал.`;

const ROUTINE_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_routines",
      description: "Показать дела в расписании на день недели",
      parameters: {
        type: "object",
        properties: { day_of_week: { type: ["integer", "null"], description: "0-6 или null" } },
        required: ["day_of_week"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_routine",
      description: "Заменить всё расписание на выбранный день списком дел",
      parameters: {
        type: "object",
        properties: {
          day_of_week: { type: ["integer", "null"] },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: { title: { type: "string" }, time: { type: ["string", "null"] } },
              required: ["title", "time"],
              additionalProperties: false,
            },
          },
        },
        required: ["day_of_week", "items"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_routine",
      description: "Добавить одно дело в расписание",
      parameters: {
        type: "object",
        properties: {
          day_of_week: { type: ["integer", "null"] },
          title: { type: "string" },
          time: { type: ["string", "null"] },
        },
        required: ["day_of_week", "title", "time"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_routine",
      description: "Удалить дело из расписания по его названию",
      parameters: {
        type: "object",
        properties: {
          day_of_week: { type: ["integer", "null"] },
          title: { type: "string" },
        },
        required: ["day_of_week", "title"],
        additionalProperties: false,
      },
    },
  },
];

type SB = { from: (t: string) => any };

async function runRoutineTool(supabase: SB, userId: string, name: string, args: any) {
  const dow: number | null = args?.day_of_week ?? null;
  const scoped = (q: any) => (dow === null ? q.is("day_of_week", null) : q.eq("day_of_week", dow));
  const time = (t: unknown) => (typeof t === "string" && /^\d{1,2}:\d{2}$/.test(t) ? t : null);

  if (name === "list_routines") {
    const { data } = await scoped(
      supabase.from("routines").select("title, time_of_day, sort_order").eq("user_id", userId),
    ).order("sort_order", { ascending: true });
    return { items: data ?? [] };
  }

  if (name === "set_routine") {
    const items = (args?.items ?? []).filter((x: any) => x && typeof x.title === "string").slice(0, 50);
    await scoped(supabase.from("routines").delete().eq("user_id", userId));
    if (items.length) {
      const { error } = await supabase.from("routines").insert(
        items.map((it: any, i: number) => ({
          user_id: userId,
          title: String(it.title).slice(0, 200),
          day_of_week: dow,
          time_of_day: time(it.time),
          sort_order: i,
        })),
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: items.length };
  }

  if (name === "add_routine") {
    const { error } = await supabase.from("routines").insert({
      user_id: userId,
      title: String(args.title).slice(0, 200),
      day_of_week: dow,
      time_of_day: time(args.time),
      sort_order: 999,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  if (name === "delete_routine") {
    await scoped(supabase.from("routines").delete().eq("user_id", userId).ilike("title", `%${args.title}%`));
    return { ok: true };
  }

  return { error: "unknown tool" };
}

export const dailyBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date();
    const dow = today.getDay();
    const todayIso = today.toISOString().slice(0, 10);
    const since = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);

    const [profile, routines, tasks, sleep, journal] = await Promise.all([
      supabase.from("profiles").select("display_name, age, gender, interests").eq("id", userId).maybeSingle(),
      supabase.from("routines").select("title, time_of_day, day_of_week").eq("user_id", userId).or(`day_of_week.eq.${dow},day_of_week.is.null`),
      supabase.from("tasks").select("title, completed, scheduled_for").eq("user_id", userId).gte("scheduled_for", since),
      supabase.from("sleep_logs").select("log_date, hours, quality").eq("user_id", userId).gte("log_date", since),
      supabase.from("journal_entries").select("entry_date, mood, content").eq("user_id", userId).gte("entry_date", since),
    ]);

    const system = friendSystemPrompt(
      profile.data?.display_name ?? null,
      profile.data?.age ?? null,
      profile.data?.gender ?? null,
      profile.data?.interests ?? null,
    );

    const raw = await callGateway([
      { role: "system", content: system },
      {
        role: "user",
        content: `Сегодня ${todayIso}. Вот мои данные за неделю в JSON:
${JSON.stringify({ routines: routines.data ?? [], tasks: tasks.data ?? [], sleep: sleep.data ?? [], journal: journal.data ?? [] })}

Ответь ТОЛЬКО валидным JSON без markdown:
{"emoji":"один эмодзи-смайлик твоего настроения","mood":"1-2 слова о настроении","message":"тёплое обращение ко мне, 1-2 предложения","tips":["совет 1","совет 2","совет 3"]}
Советы — из моих реальных данных, конкретные, на «ты», коротко.`,
      },
    ]);

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { emoji: "🙂", mood: "спокойно", message: "Я тут. Расскажи, как ты?", tips: [] as string[] };
    try {
      const p = JSON.parse(match[0]);
      return {
        emoji: typeof p.emoji === "string" ? p.emoji : "🙂",
        mood: String(p.mood ?? ""),
        message: String(p.message ?? ""),
        tips: Array.isArray(p.tips) ? p.tips.map(String).slice(0, 4) : [],
      };
    } catch {
      return { emoji: "🙂", mood: "спокойно", message: "Я тут. Расскажи, как ты?", tips: [] as string[] };
    }
  });


export const resetAiChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("ai_messages").delete().eq("user_id", context.userId);
    return { ok: true };
  });

export const analyzeWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceIso = since.toISOString().slice(0, 10);

    const [tasks, sleep, workouts, health, journal, profile, gaming, metrics, metricLogs] = await Promise.all([
      supabase.from("tasks").select("title, scope, completed, scheduled_for").eq("user_id", userId).gte("scheduled_for", sinceIso),
      supabase.from("sleep_logs").select("log_date, hours, quality").eq("user_id", userId).gte("log_date", sinceIso),
      supabase.from("workouts").select("title, kind, duration_min, intensity, workout_date").eq("user_id", userId).gte("workout_date", sinceIso),
      supabase.from("health_logs").select("log_date, mood, energy, water_ml, steps, weight_kg").eq("user_id", userId).gte("log_date", sinceIso),
      supabase.from("journal_entries").select("entry_date, mood, content").eq("user_id", userId).gte("entry_date", sinceIso),
      supabase.from("profiles").select("display_name, age, gender, interests").eq("id", userId).maybeSingle(),
      supabase.from("gaming_stats").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("custom_metrics").select("id, name, unit").eq("user_id", userId),
      supabase.from("custom_metric_logs").select("metric_id, log_date, value_num, value_text").eq("user_id", userId).gte("log_date", sinceIso),
    ]);

    const metricsList = (metrics.data ?? []) as { id: string; name: string; unit: string | null }[];
    const metricById = new Map(metricsList.map((m) => [m.id, m]));
    const enrichedLogs = (metricLogs.data ?? []).map((l) => ({
      metric: metricById.get(l.metric_id)?.name ?? "—",
      unit: metricById.get(l.metric_id)?.unit ?? null,
      date: l.log_date,
      value: l.value_num ?? l.value_text,
    }));

    const summary = {
      tasks: tasks.data ?? [],
      sleep: sleep.data ?? [],
      workouts: workouts.data ?? [],
      health: health.data ?? [],
      journal: journal.data ?? [],
      gaming: gaming.data ?? null,
      custom_metrics: enrichedLogs,
    };

    const system = friendSystemPrompt(
      profile.data?.display_name ?? null,
      profile.data?.age ?? null,
      profile.data?.gender ?? null,
      profile.data?.interests ?? null,
      { gaming: gaming.data ?? null, metrics: metricsList },
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

export const generateSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      prompt: z.string().min(1).max(4000),
      dayOfWeek: z.number().int().min(0).max(6).nullable(),
      replace: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const system = `Ты — помощник, который преобразует описание распорядка дня в JSON.
ОТВЕЧАЙ ТОЛЬКО валидным JSON-объектом, без markdown, без комментариев.
Формат строго:
{"items":[{"title":"строка до 80 символов","time":"HH:MM или null"}]}
Если время не указано — поставь null. Сохраняй порядок дел.`;

    const dayLabel = data.dayOfWeek === null
      ? "каждый день"
      : ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"][data.dayOfWeek];

    const reply = await callGateway([
      { role: "system", content: system },
      { role: "user", content: `Сделай расписание на ${dayLabel}. Описание пользователя:\n\n${data.prompt}` },
    ]);

    // extract JSON
    const match = reply.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI не вернул расписание. Попробуй переформулировать.");
    let parsed: { items: { title: string; time: string | null }[] };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new Error("Не удалось разобрать ответ AI.");
    }
    const items = (parsed.items || []).filter((x) => x && typeof x.title === "string").slice(0, 50);
    if (!items.length) throw new Error("Пустое расписание.");

    if (data.replace) {
      const del = supabase.from("routines").delete().eq("user_id", userId);
      await (data.dayOfWeek === null ? del.is("day_of_week", null) : del.eq("day_of_week", data.dayOfWeek));
    }


    const rows = items.map((it, i) => ({
      user_id: userId,
      title: it.title.slice(0, 200),
      day_of_week: data.dayOfWeek,
      time_of_day: it.time && /^\d{1,2}:\d{2}$/.test(it.time) ? it.time : null,
      sort_order: i,
    }));
    const { error } = await supabase.from("routines").insert(rows);
    if (error) throw new Error(error.message);

    return { count: rows.length };
  });
