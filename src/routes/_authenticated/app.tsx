import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "@/integrations/supabase/client";
import { LumenLogo } from "@/components/lumen-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Check, Plus, LogOut, Loader2, Trash2, Calendar, Moon, Activity,
  Dumbbell, NotebookPen, Sparkles, BarChart3, Send, RotateCw, Target, Settings as SettingsIcon, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { chatWithAi, resetAiChat, analyzeWeek, parsePlanText } from "@/lib/ai.functions";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Lumen — твой день" }] }),
  component: AppPage,
});

type Section = "plans" | "goals" | "journal" | "sleep" | "workouts" | "health" | "stats" | "ai" | "settings";

const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "plans", label: "Планы", icon: Calendar },
  { id: "goals", label: "Цели", icon: Target },
  { id: "journal", label: "Дневник", icon: NotebookPen },
  { id: "sleep", label: "Сон", icon: Moon },
  { id: "workouts", label: "Тренировки", icon: Dumbbell },
  { id: "health", label: "Здоровье", icon: Activity },
  { id: "stats", label: "Статистика", icon: BarChart3 },
  { id: "ai", label: "AI-друг", icon: Sparkles },
  { id: "settings", label: "Настройки", icon: SettingsIcon },
];

function AppPage() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("plans");
  const [name, setName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setName(data.user?.user_metadata?.name || data.user?.email?.split("@")[0] || "");
    });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="aurora-bg" />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />

      <header className="pt-safe relative z-10 mx-auto flex max-w-4xl items-center justify-between px-5 sm:px-8">
        <div className="pt-4"><LumenLogo /></div>
        <div className="flex items-center gap-2 pt-4">
          <ThemeToggle />
          <button
            onClick={signOut}
            aria-label="Выйти"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/40 backdrop-blur transition-colors hover:bg-accent"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="pb-safe relative z-10 mx-auto max-w-4xl px-5 pb-24 pt-8 sm:px-8">
        <motion.div className="mb-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="text-sm text-muted-foreground">
            <span translate="no">{greeting()}</span>{name ? ", " + name : ""}.
          </div>
          <h1 className="mt-1 font-serif text-3xl tracking-tight sm:text-4xl">
            <span translate="no">{todayLabel()}</span>
          </h1>
        </motion.div>

        {/* Section tabs */}
        <div className="-mx-5 mb-6 overflow-x-auto px-5 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex gap-1.5 rounded-full border border-border bg-card/80 p-1 backdrop-blur">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors sm:text-sm ${
                    active ? "text-background" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="section-pill"
                      className="absolute inset-0 rounded-full bg-foreground"
                      transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
                    />
                  )}
                  <Icon className="relative z-10 h-3.5 w-3.5" />
                  <span className="relative z-10">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {section === "plans" && <PlansSection />}
            {section === "goals" && <GoalsSection />}
            {section === "journal" && <JournalSection />}
            {section === "sleep" && <SleepSection />}
            {section === "workouts" && <WorkoutsSection />}
            {section === "health" && <HealthSection />}
            {section === "stats" && <StatsSection />}
            {section === "ai" && <AiSection />}
            {section === "settings" && <SettingsSection />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}


// ============= PLANS =============
type Scope = "day" | "week" | "month";
type Task = { id: string; title: string; scope: Scope; completed: boolean; scheduled_for: string };

function PlansSection() {
  const [scope, setScope] = useState<Scope>("day");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const parsePlan = useServerFn(parsePlanText);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, scope, completed, scheduled_for")
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    else setTasks((data ?? []) as Task[]);
    setLoading(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Не авторизован"); setAdding(false); return; }
    const { data, error } = await supabase
      .from("tasks")
      .insert({ title: newTitle.trim(), scope, user_id: u.user.id })
      .select("id, title, scope, completed, scheduled_for")
      .single();
    if (error) toast.error(error.message);
    else if (data) setTasks((t) => [...t, data as Task]);
    setNewTitle("");
    setAdding(false);
  }

  async function toggle(task: Task) {
    const next = !task.completed;
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, completed: next } : t)));
    const { error } = await supabase
      .from("tasks")
      .update({ completed: next, completed_at: next ? new Date().toISOString() : null })
      .eq("id", task.id);
    if (error) toast.error(error.message);
  }

  async function remove(task: Task) {
    setTasks((ts) => ts.filter((t) => t.id !== task.id));
    await supabase.from("tasks").delete().eq("id", task.id);
  }

  const filtered = tasks.filter((t) => t.scope === scope);
  const done = filtered.filter((t) => t.completed).length;
  const total = filtered.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const SCOPES: { id: Scope; label: string }[] = [
    { id: "day", label: "День" }, { id: "week", label: "Неделя" }, { id: "month", label: "Месяц" },
  ];

  return (
    <div>
      <div className="mb-6 rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Прогресс</span>
          <span className="font-medium">{done} / {total}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <motion.div className="h-full bg-foreground" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
        </div>
      </div>

      <div className="mb-4 inline-flex rounded-full border border-border bg-card p-1">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            onClick={() => setScope(s.id)}
            className={`relative rounded-full px-4 py-1.5 text-sm transition-colors ${
              scope === s.id ? "text-background" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {scope === s.id && (
              <motion.span layoutId="scope-pill" className="absolute inset-0 rounded-full bg-foreground" transition={{ type: "spring", duration: 0.5, bounce: 0.2 }} />
            )}
            <span className="relative z-10">{s.label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={add} className="mb-3 flex gap-2">
        <input
          type="text"
          placeholder={`Добавить задачу…`}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="h-12 flex-1 rounded-2xl border border-input bg-card px-4 text-sm outline-none focus:border-foreground"
        />
        <button type="submit" disabled={adding || !newTitle.trim()} className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background disabled:opacity-40">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setAiOpen((v) => !v)}
        className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Wand2 className="h-3.5 w-3.5" /> {aiOpen ? "Закрыть AI-разбор" : "AI: распознать план из текста"}
      </button>
      <AnimatePresence>
        {aiOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-4 overflow-hidden">
            <div className="rounded-2xl border border-border bg-card p-4">
              <textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                rows={4}
                placeholder="Напиши план словами: «утром бег 5км, потом созвон с командой, вечером прочитать главу»"
                className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                disabled={aiBusy || !aiText.trim()}
                onClick={async () => {
                  setAiBusy(true);
                  try {
                    const r = await parsePlan({ data: { text: aiText.trim(), scope } });
                    if (r.inserted) {
                      setTasks((t) => [...t, ...(r.tasks as Task[])]);
                      toast.success(`Добавлено: ${r.inserted}`);
                      setAiText(""); setAiOpen(false);
                    } else toast.error("AI не нашёл задач в тексте");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Ошибка");
                  } finally { setAiBusy(false); }
                }}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40"
              >
                {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Распознать и добавить
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      {loading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <Empty text="Пока пусто. Добавь первую задачу." />
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {filtered.map((task) => (
              <motion.li
                key={task.id} layout
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -10 }}
                className="group flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <button
                  onClick={() => toggle(task)} aria-label="Отметить"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    task.completed ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground"
                  }`}
                >
                  {task.completed && <Check className="h-3 w-3" strokeWidth={3} />}
                </button>
                <span className={`flex-1 text-sm ${task.completed ? "text-muted-foreground line-through" : ""}`}>{task.title}</span>
                <button onClick={() => remove(task)} aria-label="Удалить" className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100">
                  <Trash2 className="h-4 w-4" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

// ============= JOURNAL =============
type Journal = { id: string; content: string; mood: number | null; entry_date: string; created_at: string };

function JournalSection() {
  const [entries, setEntries] = useState<Journal[]>([]);
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<number>(3);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("journal_entries").select("*").order("created_at", { ascending: false }).limit(50);
    setEntries((data ?? []) as Journal[]);
    setLoading(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setAdding(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("journal_entries")
      .insert({ user_id: u.user!.id, content: content.trim(), mood })
      .select("*").single();
    if (error) toast.error(error.message);
    else if (data) setEntries((e) => [data as Journal, ...e]);
    setContent("");
    setAdding(false);
  }

  async function remove(id: string) {
    setEntries((e) => e.filter((x) => x.id !== id));
    await supabase.from("journal_entries").delete().eq("id", id);
  }

  return (
    <div>
      <form onSubmit={add} className="mb-6 rounded-2xl border border-border bg-card p-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Что в голове сегодня?"
          rows={3}
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-3 flex items-center justify-between">
          <MoodPicker value={mood} onChange={setMood} />
          <button type="submit" disabled={adding || !content.trim()} className="inline-flex h-9 items-center gap-2 rounded-full bg-foreground px-4 text-xs font-medium text-background disabled:opacity-40">
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Записать
          </button>
        </div>
      </form>

      {loading ? <Loader /> : entries.length === 0 ? <Empty text="Дневник пуст. Запиши первую мысль." /> : (
        <ul className="flex flex-col gap-2">
          {entries.map((j) => (
            <li key={j.id} className="group rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="mb-1 text-xs text-muted-foreground">
                    {formatDate(j.created_at)} · настроение {moodEmoji(j.mood)}
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{j.content}</p>
                </div>
                <button onClick={() => remove(j.id)} className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MoodPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button" onClick={() => onChange(n)}
          className={`h-8 w-8 rounded-full text-base transition-colors ${value === n ? "bg-foreground" : "bg-secondary hover:bg-accent"}`}
        >
          {moodEmoji(n)}
        </button>
      ))}
    </div>
  );
}

function moodEmoji(m: number | null) {
  return ["😞", "🙁", "😐", "🙂", "😄"][((m ?? 3) - 1) as 0 | 1 | 2 | 3 | 4] || "😐";
}

// ============= SLEEP =============
type Sleep = { id: string; log_date: string; hours: number; quality: number | null };

function SleepSection() {
  const [logs, setLogs] = useState<Sleep[]>([]);
  const [hours, setHours] = useState("8");
  const [quality, setQuality] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    const { data } = await supabase.from("sleep_logs").select("*").order("log_date", { ascending: false }).limit(30);
    setLogs((data ?? []) as Sleep[]);
    setLoading(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const h = parseFloat(hours);
    if (!h || h < 0 || h > 24) { toast.error("Часы выглядят странно"); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("sleep_logs")
      .upsert({ user_id: u.user!.id, hours: h, quality, log_date: today }, { onConflict: "user_id,log_date" })
      .select("*").single();
    if (error) toast.error(error.message);
    else if (data) {
      setLogs((l) => [data as Sleep, ...l.filter((x) => x.log_date !== (data as Sleep).log_date)]);
      toast.success("Сон записан");
    }
    setSaving(false);
  }

  const chartData = useMemo(() => [...logs].reverse().map((l) => ({ date: l.log_date.slice(5), hours: Number(l.hours), quality: l.quality ?? 0 })), [logs]);
  const avg = logs.length ? (logs.reduce((s, l) => s + Number(l.hours), 0) / logs.length).toFixed(1) : "—";

  return (
    <div>
      <form onSubmit={save} className="mb-6 rounded-2xl border border-border bg-card p-5">
        <div className="mb-1 text-xs text-muted-foreground">Сегодня я спал</div>
        <div className="flex items-end gap-3">
          <input type="number" step="0.5" min="0" max="24" value={hours} onChange={(e) => setHours(e.target.value)}
            className="h-14 w-24 rounded-xl border border-input bg-background px-3 text-2xl font-serif outline-none focus:border-foreground" />
          <span className="pb-2 text-sm text-muted-foreground">часов</span>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-xs text-muted-foreground">Качество</div>
          <MoodPicker value={quality} onChange={setQuality} />
        </div>
        <button type="submit" disabled={saving} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}Сохранить
        </button>
      </form>

      <div className="mb-6 rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Среднее за {logs.length} дней</span>
          <span className="font-serif text-2xl">{avg}<span className="ml-1 text-sm text-muted-foreground">ч</span></span>
        </div>
        {chartData.length > 0 && (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} domain={[0, 12]} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
                <Line type="monotone" dataKey="hours" stroke="var(--foreground)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {loading ? <Loader /> : logs.length === 0 ? <Empty text="Ещё нет записей." /> : (
        <ul className="flex flex-col gap-2">
          {logs.slice(0, 7).map((l) => (
            <li key={l.id} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm">
              <span className="text-muted-foreground">{l.log_date}</span>
              <span><span className="font-medium">{Number(l.hours)}ч</span> <span className="text-muted-foreground">{moodEmoji(l.quality)}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============= WORKOUTS =============
type Workout = { id: string; title: string; kind: string | null; duration_min: number | null; intensity: number | null; workout_date: string };

function WorkoutsSection() {
  const [items, setItems] = useState<Workout[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("strength");
  const [duration, setDuration] = useState("45");
  const [intensity, setIntensity] = useState(3);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    const { data } = await supabase.from("workouts").select("*").order("workout_date", { ascending: false }).limit(30);
    setItems((data ?? []) as Workout[]);
    setLoading(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("workouts").insert({
      user_id: u.user!.id,
      title: title.trim(),
      kind,
      duration_min: duration ? parseInt(duration) : null,
      intensity,
    }).select("*").single();
    if (error) toast.error(error.message);
    else if (data) {
      setItems((l) => [data as Workout, ...l]);
      setTitle("");
      toast.success("Записано");
    }
  }

  async function remove(id: string) {
    setItems((l) => l.filter((x) => x.id !== id));
    await supabase.from("workouts").delete().eq("id", id);
  }

  const KINDS = ["strength", "cardio", "stretch", "sport"];
  const labels: Record<string, string> = { strength: "Сила", cardio: "Кардио", stretch: "Растяжка", sport: "Спорт" };

  return (
    <div>
      <form onSubmit={add} className="mb-6 rounded-2xl border border-border bg-card p-5">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: ноги, бег 5 км"
          className="mb-3 h-11 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none focus:border-foreground" />
        <div className="mb-3 flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${kind === k ? "border-foreground bg-foreground text-background" : "border-input text-muted-foreground hover:text-foreground"}`}>
              {labels[k]}
            </button>
          ))}
        </div>
        <div className="mb-3 flex items-center gap-3">
          <input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)}
            className="h-11 w-24 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-foreground" />
          <span className="text-sm text-muted-foreground">минут</span>
        </div>
        <div className="mb-3">
          <div className="mb-1.5 text-xs text-muted-foreground">Интенсивность</div>
          <MoodPicker value={intensity} onChange={setIntensity} />
        </div>
        <button type="submit" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background">
          <Plus className="h-4 w-4" />Добавить тренировку
        </button>
      </form>

      {loading ? <Loader /> : items.length === 0 ? <Empty text="Ещё ни одной тренировки." /> : (
        <ul className="flex flex-col gap-2">
          {items.map((w) => (
            <li key={w.id} className="group flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
              <div>
                <div className="text-sm font-medium">{w.title}</div>
                <div className="text-xs text-muted-foreground">
                  {w.workout_date} · {labels[w.kind || ""] ?? w.kind} · {w.duration_min ?? 0} мин
                </div>
              </div>
              <button onClick={() => remove(w.id)} className="opacity-0 hover:text-destructive group-hover:opacity-100">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============= HEALTH =============
type Health = { id: string; log_date: string; mood: number | null; energy: number | null; water_ml: number | null; steps: number | null; weight_kg: number | null };

function HealthSection() {
  const [logs, setLogs] = useState<Health[]>([]);
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [water, setWater] = useState("");
  const [steps, setSteps] = useState("");
  const [weight, setWeight] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    const { data } = await supabase.from("health_logs").select("*").order("log_date", { ascending: false }).limit(30);
    setLogs((data ?? []) as Health[]);
    setLoading(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const today = new Date().toISOString().slice(0, 10);
    const payload = {
      user_id: u.user!.id,
      log_date: today,
      mood, energy,
      water_ml: water ? parseInt(water) : null,
      steps: steps ? parseInt(steps) : null,
      weight_kg: weight ? parseFloat(weight) : null,
    };
    const { data, error } = await supabase.from("health_logs").upsert(payload, { onConflict: "user_id,log_date" }).select("*").single();
    if (error) toast.error(error.message);
    else if (data) {
      setLogs((l) => [data as Health, ...l.filter((x) => x.log_date !== (data as Health).log_date)]);
      toast.success("Сохранено");
    }
    setSaving(false);
  }

  return (
    <div>
      <form onSubmit={save} className="mb-6 rounded-2xl border border-border bg-card p-5">
        <div className="mb-4">
          <div className="mb-1.5 text-xs text-muted-foreground">Настроение</div>
          <MoodPicker value={mood} onChange={setMood} />
        </div>
        <div className="mb-4">
          <div className="mb-1.5 text-xs text-muted-foreground">Энергия</div>
          <MoodPicker value={energy} onChange={setEnergy} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Вода, мл" value={water} onChange={setWater} placeholder="2000" />
          <Field label="Шаги" value={steps} onChange={setSteps} placeholder="8000" />
          <Field label="Вес, кг" value={weight} onChange={setWeight} placeholder="70" />
        </div>
        <button type="submit" disabled={saving} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}Сохранить день
        </button>
      </form>

      {loading ? <Loader /> : logs.length === 0 ? <Empty text="Записей нет." /> : (
        <ul className="flex flex-col gap-2">
          {logs.slice(0, 10).map((h) => (
            <li key={h.id} className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
              <div className="mb-1 text-xs text-muted-foreground">{h.log_date}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>Настр {moodEmoji(h.mood)}</span>
                <span>Энерг {moodEmoji(h.energy)}</span>
                {h.water_ml != null && <span>💧 {h.water_ml}мл</span>}
                {h.steps != null && <span>👟 {h.steps}</span>}
                {h.weight_kg != null && <span>⚖️ {Number(h.weight_kg)}кг</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-foreground" />
    </label>
  );
}

// ============= STATS =============
function StatsSection() {
  const [data, setData] = useState<{ sleep: Sleep[]; tasks: Task[]; workouts: Workout[]; health: Health[] } | null>(null);

  useEffect(() => {
    (async () => {
      const since = new Date(); since.setDate(since.getDate() - 14);
      const sinceIso = since.toISOString().slice(0, 10);
      const [sleep, tasks, workouts, health] = await Promise.all([
        supabase.from("sleep_logs").select("*").gte("log_date", sinceIso),
        supabase.from("tasks").select("*").gte("scheduled_for", sinceIso),
        supabase.from("workouts").select("*").gte("workout_date", sinceIso),
        supabase.from("health_logs").select("*").gte("log_date", sinceIso),
      ]);
      setData({
        sleep: (sleep.data ?? []) as Sleep[],
        tasks: (tasks.data ?? []) as Task[],
        workouts: (workouts.data ?? []) as Workout[],
        health: (health.data ?? []) as Health[],
      });
    })();
  }, []);

  if (!data) return <Loader />;

  const tasksDone = data.tasks.filter((t) => t.completed).length;
  const taskPct = data.tasks.length ? Math.round((tasksDone / data.tasks.length) * 100) : 0;
  const sleepAvg = data.sleep.length ? (data.sleep.reduce((s, l) => s + Number(l.hours), 0) / data.sleep.length).toFixed(1) : "—";
  const workoutsCount = data.workouts.length;
  const moodAvg = data.health.length ? (data.health.reduce((s, h) => s + (h.mood ?? 0), 0) / data.health.length).toFixed(1) : "—";

  const moodChart = [...data.health].reverse().map((h) => ({ date: h.log_date.slice(5), mood: h.mood, energy: h.energy }));
  const sleepChart = [...data.sleep].reverse().map((l) => ({ date: l.log_date.slice(5), hours: Number(l.hours) }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Задачи закрыты" value={`${taskPct}%`} sub={`${tasksDone}/${data.tasks.length}`} />
        <Stat label="Средний сон" value={`${sleepAvg}ч`} sub="14 дней" />
        <Stat label="Тренировок" value={String(workoutsCount)} sub="за 2 недели" />
        <Stat label="Настроение" value={moodAvg} sub="из 5" />
      </div>

      {sleepChart.length > 0 && (
        <Card title="Сон, часы">
          <div className="h-40">
            <ResponsiveContainer><LineChart data={sleepChart}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
              <Line type="monotone" dataKey="hours" stroke="var(--foreground)" strokeWidth={2} />
            </LineChart></ResponsiveContainer>
          </div>
        </Card>
      )}

      {moodChart.length > 0 && (
        <Card title="Настроение и энергия">
          <div className="h-40">
            <ResponsiveContainer><BarChart data={moodChart}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} domain={[0, 5]} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="mood" fill="var(--foreground)" />
              <Bar dataKey="energy" fill="var(--muted-foreground)" />
            </BarChart></ResponsiveContainer>
          </div>
        </Card>
      )}

      <AnalyzeButton />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-serif text-3xl tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 text-sm text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function AnalyzeButton() {
  const fn = useServerFn(analyzeWeek);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const r = await fn();
      setResult(r.analysis);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-medium">AI-разбор недели</span>
      </div>
      <button onClick={run} disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? "Думаю…" : "Проанализировать"}
      </button>
      {result && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 whitespace-pre-wrap rounded-xl border border-border bg-background p-4 text-sm leading-relaxed">
          {result}
        </motion.div>
      )}
    </div>
  );
}

// ============= AI CHAT =============
type AiMsg = { id?: string; role: "user" | "assistant"; content: string };

function AiSection() {
  const send = useServerFn(chatWithAi);
  const reset = useServerFn(resetAiChat);
  const [messages, setMessages] = useState<AiMsg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    const { data } = await supabase.from("ai_messages").select("id, role, content").order("created_at", { ascending: true });
    setMessages((data ?? []).filter((m) => m.role !== "system") as AiMsg[]);
    setLoading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    const userMsg = text.trim();
    setText("");
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setSending(true);
    try {
      const r = await send({ data: { message: userMsg } });
      setMessages((m) => [...m, { role: "assistant", content: r.reply }]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSending(false);
    }
  }

  async function clearChat() {
    if (!confirm("Очистить весь разговор?")) return;
    await reset();
    setMessages([]);
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">Lumen — твой AI-друг</span>
        </div>
        <button onClick={clearChat} className="text-xs text-muted-foreground hover:text-foreground">
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? <Loader /> : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Привет. Расскажи, что у тебя сегодня — я тут.
          </div>
        ) : messages.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              m.role === "user" ? "bg-foreground text-background" : "bg-secondary"
            }`}>
              {m.content}
            </div>
          </motion.div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-secondary px-4 py-2.5 text-sm">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-muted-foreground" />
                <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-muted-foreground [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-muted-foreground [animation-delay:240ms]" />
              </span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Напиши что-нибудь…"
          className="h-11 flex-1 rounded-full border border-input bg-background px-4 text-sm outline-none focus:border-foreground"
        />
        <button type="submit" disabled={!text.trim() || sending} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

// ============= shared =============
function Loader() {
  return <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">{text}</div>;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

function todayLabel() {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
