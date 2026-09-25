import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Google Gemini by default, via its OpenAI-compatible endpoint. Any other
// OpenAI-compatible API works too: set AI_API_URL / AI_MODEL.
const DEFAULT_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const DEFAULT_MODEL = "gemini-flash-latest";
// Legacy fallback for deployments that still run on Lovable Cloud.
const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_MODEL = "google/gemini-3-flash-preview";

// Read inside a function: on edge runtimes env binds at request time.
function aiConfig() {
  if (process.env.AI_API_KEY) {
    return {
      url: process.env.AI_API_URL || DEFAULT_API_URL,
      key: process.env.AI_API_KEY,
      model: process.env.AI_MODEL || DEFAULT_MODEL,
    };
  }
  if (process.env.LOVABLE_API_KEY) {
    return { url: LOVABLE_GATEWAY, key: process.env.LOVABLE_API_KEY, model: LOVABLE_MODEL };
  }
  throw new Error("AI_API_KEY не задан");
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
type Msg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type GwChoice = { message: { content: string | null; tool_calls?: ToolCall[] } };

export type AiProposal =
  | { kind: "create_task"; title: string; date: string; time: string | null; repeatDays?: number[] }
  | {
      kind: "update_task";
      taskId: string;
      routineId?: string | null;
      fromDate: string;
      title: string;
      date: string;
      time: string | null;
    }
  | { kind: "schedule"; date: string; items: { title: string; time: string | null }[] };

async function rawGateway(messages: Msg[], tools?: unknown[]): Promise<GwChoice["message"]> {
  const { url, key, model } = aiConfig();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages, ...(tools ? { tools } : {}) }),
  });
  if (res.status === 429) throw new Error("Слишком много запросов. Попробуй позже.");
  if (res.status === 402) throw new Error("Закончились AI-кредиты.");
  if (!res.ok) throw new Error(`AI API: ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message ?? { content: "" };
}

export const CHAT_IMAGES_BUCKET = "chat-images";

// The server runs in UTC and doesn't know the user's timezone, so the client
// sends its local date (YYYY-MM-DD). Falls back to the server date.
const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish();

function dayInfo(today?: string | null) {
  const iso = today ?? new Date().toISOString().slice(0, 10);
  const minusDays = (days: number) => {
    const date = new Date(`${iso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  };
  return { iso, dow: new Date(`${iso}T12:00:00Z`).getUTCDay(), minusDays };
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function loadChatImage(supabase: { storage: SupabaseStorage }, path: string) {
  const { data, error } = await supabase.storage.from(CHAT_IMAGES_BUCKET).download(path);
  if (error || !data) throw new Error("Не удалось прочитать фото");
  const bytes = new Uint8Array(await data.arrayBuffer());
  return `data:${data.type || "image/jpeg"};base64,${toBase64(bytes)}`;
}

type SupabaseStorage = {
  from: (bucket: string) => {
    download: (path: string) => Promise<{ data: Blob | null; error: unknown }>;
    remove: (paths: string[]) => Promise<unknown>;
  };
};

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
  if (extras.metrics?.length)
    ctx.push(
      `Личные метрики: ${extras.metrics.map((m) => m.name + (m.unit ? ` (${m.unit})` : "")).join(", ")}`,
    );
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
  .inputValidator((d: unknown) =>
    z
      .object({
        message: z.string().max(4000),
        imagePath: z.string().max(300).nullish(),
        today: localDate,
      })
      .refine((v) => v.message.trim() || v.imagePath, "Пустое сообщение")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const imagePath = data.imagePath ?? null;
    if (imagePath && !new RegExp(`^${userId}/[\\w-]+\\.(jpe?g|png|webp)$`).test(imagePath)) {
      throw new Error("Некорректное фото");
    }
    const text = data.message.trim() || "Посмотри на фото.";

    const [{ data: profile }, { data: history }, { data: gaming }, { data: metrics }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, age, gender, interests")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("ai_messages")
          .select("role, content")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
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
      {
        role: "system",
        content: system + `\n\nСегодня ${dayInfo(data.today).iso}.\n` + ROUTINE_TOOLS_HINT,
      },
      // Photo-only messages are stored with empty text; old photos are not re-sent to the model.
      ...(history ?? [])
        .reverse()
        .map((m) => ({ role: m.role, content: m.content || "[фото]" }) as Msg),
      {
        role: "user",
        content: imagePath
          ? [
              { type: "text", text },
              { type: "image_url", image_url: { url: await loadChatImage(supabase, imagePath) } },
            ]
          : text,
      },
    ];

    let reply = "";
    let proposal: AiProposal | null = null;
    for (let step = 0; step < 5; step++) {
      const m = await rawGateway(messages, ROUTINE_TOOLS);
      if (m.tool_calls?.length) {
        messages.push({ role: "assistant", content: m.content ?? "", tool_calls: m.tool_calls });
        for (const call of m.tool_calls) {
          let result: unknown;
          try {
            const toolResult = await runRoutineTool(
              supabase,
              userId,
              call.function.name,
              JSON.parse(call.function.arguments || "{}"),
            );
            result = toolResult.result;
            if (toolResult.proposal) proposal = toolResult.proposal;
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
      {
        user_id: userId,
        role: "user",
        content: data.message.trim(),
        ...(imagePath ? { image_path: imagePath } : {}),
      },
      { user_id: userId, role: "assistant", content: reply },
    ]);

    return { reply, proposal };
  });

const ROUTINE_TOOLS_HINT = `Ты помогаешь планировать, но НИКОГДА сам не меняешь данные.
Когда пользователь просит создать задачу, составить расписание или перенести дело, используй подходящий инструмент предложения.
Инструмент только формирует карточку подтверждения. Скажи коротко, что предлагаешь, и попроси подтвердить.
Дата строго YYYY-MM-DD, время HH:MM или пустая строка. Для поиска существующего дела сначала используй list_tasks.`;

const ROUTINE_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "Найти задачи и экземпляры рутин пользователя по дате или названию",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD или пусто" },
          query: { type: "string", description: "часть названия или пусто" },
        },
        required: ["date", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_schedule",
      description: "Предложить несколько одноразовых задач на конкретную дату",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                time: { type: "string", description: "HH:MM или пусто" },
              },
              required: ["title", "time"],
            },
          },
        },
        required: ["date", "items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_create_task",
      description: "Предложить создать одну задачу или повторяющуюся рутину",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string" },
          time: { type: "string", description: "HH:MM или пусто" },
          repeat_days: {
            type: "array",
            items: { type: "integer" },
            description: "0=Вс…6=Сб; пусто для одноразовой задачи",
          },
        },
        required: ["title", "date", "time", "repeat_days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_update_task",
      description: "Предложить перенос или изменение найденной задачи",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string" },
          routine_id: { type: "string", description: "id рутины или пусто" },
          title: { type: "string" },
          date: { type: "string" },
          from_date: { type: "string" },
          time: { type: "string", description: "HH:MM или пусто" },
        },
        required: ["task_id", "routine_id", "title", "date", "from_date", "time"],
      },
    },
  },
];

type ToolArgs = Record<string, unknown>;

async function runRoutineTool(
  supabase: SupabaseClient<Database>,
  userId: string,
  name: string,
  args: ToolArgs,
) {
  const time = (t: unknown) => (typeof t === "string" && /^\d{1,2}:\d{2}$/.test(t) ? t : null);

  if (name === "list_tasks") {
    let query = supabase
      .from("tasks")
      .select("id,title,scheduled_for,scheduled_time,routine_id")
      .eq("user_id", userId);
    if (args?.date) query = query.eq("scheduled_for", String(args.date));
    if (args?.query) query = query.ilike("title", `%${String(args.query).slice(0, 100)}%`);
    const { data } = await query.order("scheduled_for", { ascending: true }).limit(30);
    return { result: { items: data ?? [] }, proposal: null };
  }

  if (name === "propose_schedule") {
    const proposal: AiProposal = {
      kind: "schedule",
      date: String(args.date),
      items: (Array.isArray(args.items) ? (args.items as ToolArgs[]) : [])
        .slice(0, 30)
        .map((item) => ({ title: String(item.title).slice(0, 200), time: time(item.time) })),
    };
    return { result: { proposed: true, count: proposal.items.length }, proposal };
  }

  if (name === "propose_create_task") {
    const proposal: AiProposal = {
      kind: "create_task",
      title: String(args.title).slice(0, 200),
      date: String(args.date),
      time: time(args.time),
      repeatDays: Array.isArray(args.repeat_days)
        ? args.repeat_days.filter(
            (day: unknown) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6,
          )
        : [],
    };
    return { result: { proposed: true }, proposal };
  }

  if (name === "propose_update_task") {
    const proposal: AiProposal = {
      kind: "update_task",
      taskId: String(args.task_id),
      routineId: args.routine_id ? String(args.routine_id) : null,
      title: String(args.title).slice(0, 200),
      date: String(args.date),
      fromDate: String(args.from_date),
      time: time(args.time),
    };
    return { result: { proposed: true }, proposal };
  }

  return { result: { error: "unknown tool" }, proposal: null };
}

export const dailyBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ today: localDate }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const day = dayInfo(data.today);
    const dow = day.dow;
    const todayIso = day.iso;
    const since = day.minusDays(7);

    const [profile, routines, tasks, sleep, journal] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, age, gender, interests")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("routines")
        .select("title, time_of_day, day_of_week")
        .eq("user_id", userId)
        .or(`day_of_week.eq.${dow},day_of_week.is.null`),
      supabase
        .from("tasks")
        .select("title, completed, scheduled_for")
        .eq("user_id", userId)
        .gte("scheduled_for", since),
      supabase
        .from("sleep_logs")
        .select("log_date, hours, quality")
        .eq("user_id", userId)
        .gte("log_date", since),
      supabase
        .from("journal_entries")
        .select("entry_date, mood, content")
        .eq("user_id", userId)
        .gte("entry_date", since),
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
    if (!match)
      return {
        emoji: "🙂",
        mood: "спокойно",
        message: "Я тут. Расскажи, как ты?",
        tips: [] as string[],
      };
    try {
      const p = JSON.parse(match[0]);
      return {
        emoji: typeof p.emoji === "string" ? p.emoji : "🙂",
        mood: String(p.mood ?? ""),
        message: String(p.message ?? ""),
        tips: Array.isArray(p.tips) ? p.tips.map(String).slice(0, 4) : [],
      };
    } catch {
      return {
        emoji: "🙂",
        mood: "спокойно",
        message: "Я тут. Расскажи, как ты?",
        tips: [] as string[],
      };
    }
  });

export const resetAiChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // image_path may not exist yet if the chat-images migration isn't applied; then there is nothing to remove.
    const { data: withImages } = await supabase
      .from("ai_messages")
      .select("image_path")
      .eq("user_id", userId)
      .not("image_path", "is", null);
    const paths = (withImages ?? [])
      .map((row) => row.image_path)
      .filter((path): path is string => !!path);
    if (paths.length) await supabase.storage.from(CHAT_IMAGES_BUCKET).remove(paths);
    await supabase.from("ai_messages").delete().eq("user_id", userId);
    return { ok: true };
  });

export const analyzeWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ today: localDate }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const sinceIso = dayInfo(data.today).minusDays(7);

    const [tasks, sleep, workouts, health, journal, profile, gaming, metrics, metricLogs] =
      await Promise.all([
        supabase
          .from("tasks")
          .select("title, scope, completed, scheduled_for")
          .eq("user_id", userId)
          .gte("scheduled_for", sinceIso),
        supabase
          .from("sleep_logs")
          .select("log_date, hours, quality")
          .eq("user_id", userId)
          .gte("log_date", sinceIso),
        supabase
          .from("workouts")
          .select("title, kind, duration_min, intensity, workout_date")
          .eq("user_id", userId)
          .gte("workout_date", sinceIso),
        supabase
          .from("health_logs")
          .select("log_date, mood, energy, water_ml, steps, weight_kg")
          .eq("user_id", userId)
          .gte("log_date", sinceIso),
        supabase
          .from("journal_entries")
          .select("entry_date, mood, content")
          .eq("user_id", userId)
          .gte("entry_date", sinceIso),
        supabase
          .from("profiles")
          .select("display_name, age, gender, interests")
          .eq("id", userId)
          .maybeSingle(),
        supabase.from("gaming_stats").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("custom_metrics").select("id, name, unit").eq("user_id", userId),
        supabase
          .from("custom_metric_logs")
          .select("metric_id, log_date, value_num, value_text")
          .eq("user_id", userId)
          .gte("log_date", sinceIso),
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
