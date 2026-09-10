import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "@/integrations/supabase/client";
import { LumenLogo } from "@/components/lumen-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Check, Plus, Loader2, Trash2, Calendar, Moon, Activity,
  Dumbbell, NotebookPen, Sparkles, BarChart3, Send, RotateCw,
  CalendarClock, Settings as SettingsIcon, Wand2, Gamepad2, Ruler, RefreshCw,
  Home, Bell,
} from "lucide-react";
import { toast } from "sonner";
import { chatWithAi, resetAiChat, analyzeWeek, generateSchedule, dailyBrief } from "@/lib/ai.functions";
import { syncGaming } from "@/lib/gaming.functions";
import { scheduleRoutineReminders, remindNow } from "@/lib/reminders";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Lumen — твой день" }] }),
  component: AppPage,
});


type Section = "home" | "plans" | "routine" | "journal" | "sleep" | "ai" | "metrics";

const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Главная", icon: Home },
  { id: "plans", label: "Планы", icon: Calendar },
  { id: "routine", label: "Рутина", icon: CalendarClock },
  { id: "journal", label: "Дневник", icon: NotebookPen },
  { id: "sleep", label: "Сон", icon: Moon },
  { id: "ai", label: "AI-друг", icon: Sparkles },
];

function AppPage() {
  const [section, setSection] = useState<Section>("home");
  const [name, setName] = useState("");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("display_name").eq("id", u.user.id).maybeSingle();
      setName(data?.display_name || u.user.user_metadata?.name || u.user.email?.split("@")[0] || "");
    })();
  }, []);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-glow" />

      <header className="relative z-10 mx-auto flex max-w-4xl items-center justify-between px-5 pt-2 sm:px-8 sm:pt-4">
        <LumenLogo />
        <div className="flex items-center gap-2">
          <ThemeToggle className="!h-11 !w-11" />
          <Link
            to="/app/settings"
            aria-label="Настройки"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/40 backdrop-blur transition-colors hover:bg-accent active:scale-95"
          >
            <SettingsIcon className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-4xl px-5 pb-36 pt-3 sm:px-8 sm:pt-6">
        <div className="mb-5">
          <div className="text-sm text-muted-foreground">
            <span translate="no">{greeting()}</span>{name ? ", " + name : ""}.
          </div>
          <h1 className="mt-1 font-serif text-2xl tracking-tight sm:text-3xl">
            <span translate="no">{todayLabel()}</span>
          </h1>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {section === "home" && <HomeSection onGo={setSection} />}
            {section === "plans" && <PlansSection />}
            {section === "routine" && <RoutinesSection />}
            {section === "journal" && <JournalSection />}
            {section === "sleep" && <SleepSection />}
            {section === "metrics" && <MetricsSection />}
            {section === "ai" && <AiSection />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-stretch justify-between px-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                aria-label={s.label}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <span className={`relative inline-flex h-9 w-full max-w-14 items-center justify-center rounded-2xl ${active ? "bg-accent" : ""}`}>
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <span className="text-[10px] leading-none">{s.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}


// ============= HOME =============
type Brief = { emoji: string; mood: string; message: string; tips: string[] };

function HomeSection({ onGo }: { onGo: (s: Section) => void }) {
  const brief = useServerFn(dailyBrief);
  const [data, setData] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifState, setNotifState] = useState<string>("default");
  const todayIso = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setNotifState(Notification.permission);
      if (Notification.permission === "granted") void scheduleRoutineReminders();
    }
    const cacheKey = "lumen-brief-" + todayIso;
    const cached = typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null;
    if (cached) {
      try { setData(JSON.parse(cached)); setLoading(false); return; } catch { /* ignore */ }
    }
    (async () => {
      try {
        const r = await brief();
        setData(r);
        localStorage.setItem(cacheKey, JSON.stringify(r));
      } catch {
        setData({ emoji: "🙂", mood: "", message: "Я рядом. Расскажи, как день?", tips: [] });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function enableNotifications() {
    if (typeof Notification === "undefined") { toast.error("Уведомления не поддерживаются"); return; }
    const p = await Notification.requestPermission();
    setNotifState(p);
    if (p === "granted") {
      await scheduleRoutineReminders();
      new Notification("Lumen", { body: "Готово — буду напоминать про твои дела 🙌", icon: "/icon-192.png" });
    } else {
      toast.error("Разреши уведомления в настройках браузера");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl border border-border bg-card p-6 text-center">
        {loading ? (
          <div className="py-8"><Loader /></div>
        ) : (
          <>
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", bounce: 0.4 }}
              className="text-7xl leading-none"
            >
              {data?.emoji ?? "🙂"}
            </motion.div>
            {data?.mood && <div className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">{data.mood}</div>}
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-foreground">{data?.message}</p>
            <button
              onClick={() => onGo("ai")}
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background"
            >
              <Sparkles className="h-4 w-4" /> Поговорить
            </button>
          </>
        )}
      </div>

      {!!data?.tips?.length && (
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Советы на сегодня</div>
          <ul className="flex flex-col gap-3">
            {data.tips.map((t, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onGo("routine")} className="flex flex-col items-start gap-2 rounded-3xl border border-border bg-card p-5 text-left hover:bg-accent">
          <CalendarClock className="h-5 w-5" />
          <span className="text-sm font-medium">Рутина на сегодня</span>
        </button>
        <button onClick={() => onGo("metrics")} className="flex flex-col items-start gap-2 rounded-3xl border border-border bg-card p-5 text-left hover:bg-accent">
          <Ruler className="h-5 w-5" />
          <span className="text-sm font-medium">Мои метрики</span>
        </button>
      </div>

      {notifState !== "granted" ? (
        <button
          onClick={enableNotifications}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card text-sm hover:bg-accent"
        >
          <Bell className="h-4 w-4" /> Включить напоминания
        </button>
      ) : (
        <button
          onClick={async () => {
            const left = await remindNow();
            toast.success(left === 0 ? "Всё сделано на сегодня 🎉" : `Осталось дел: ${left}`);
          }}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card text-sm hover:bg-accent"
        >
          <Bell className="h-4 w-4" /> Что я ещё не сделал
        </button>
      )}
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

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    await seedRoutinesForToday();
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

      <form onSubmit={add} className="mb-6 flex gap-2">
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
                <button onClick={() => remove(task)} aria-label="Удалить" className="text-muted-foreground transition-colors hover:text-destructive">
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

// ============= ROUTINES =============
type Routine = { id: string; title: string; day_of_week: number | null; time_of_day: string | null; sort_order: number };

const DAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const DAY_LABELS_FULL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

async function seedRoutinesForToday() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const today = new Date();
  const dow = today.getDay();
  const todayIso = today.toISOString().slice(0, 10);

  const { data: routines } = await supabase
    .from("routines")
    .select("id, title")
    .eq("user_id", u.user.id)
    .eq("active", true)
    .or(`day_of_week.eq.${dow},day_of_week.is.null`);

  if (!routines || routines.length === 0) return;

  const { data: existing } = await supabase
    .from("tasks")
    .select("routine_id")
    .eq("user_id", u.user.id)
    .eq("scheduled_for", todayIso)
    .not("routine_id", "is", null);

  const existingIds = new Set((existing ?? []).map((t) => t.routine_id));
  const toInsert = routines
    .filter((r) => !existingIds.has(r.id))
    .map((r) => ({
      user_id: u.user!.id,
      title: r.title,
      scope: "day",
      scheduled_for: todayIso,
      routine_id: r.id,
    }));

  if (toInsert.length > 0) {
    await supabase.from("tasks").insert(toInsert);
  }
}

function RoutinesSection() {
  const [day, setDay] = useState<number | null>(new Date().getDay());
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const generate = useServerFn(generateSchedule);

  useEffect(() => { load(); }, [day]);

  async function load() {
    setLoading(true);
    const q = supabase.from("routines").select("*").order("sort_order", { ascending: true });
    const { data } = await (day === null ? q.is("day_of_week", null) : q.eq("day_of_week", day));
    setRoutines((data ?? []) as Routine[]);
    setLoading(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("routines")
      .insert({ user_id: u.user!.id, title: newTitle.trim(), day_of_week: day, sort_order: routines.length })
      .select("*").single();
    if (error) toast.error(error.message);
    else if (data) setRoutines((r) => [...r, data as Routine]);
    setNewTitle("");
    setAdding(false);
  }

  async function remove(r: Routine) {
    setRoutines((rs) => rs.filter((x) => x.id !== r.id));
    await supabase.from("routines").delete().eq("id", r.id);
  }

  async function runAi() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const r = await generate({ data: { prompt: aiPrompt.trim(), dayOfWeek: day, replace: true } });
      toast.success(`Создано ${r.count} дел`);
      setAiPrompt("");
      setAiOpen(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setAiLoading(false);
    }
  }

  const dayLabel = day === null ? "каждый день" : DAY_LABELS_FULL[day];

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Постоянные дела, которые автоматически появятся в плане на нужный день недели.
      </div>

      <div className="-mx-5 mb-4 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <div className="inline-flex gap-1 rounded-full border border-border bg-card p-1">
          <button
            onClick={() => setDay(null)}
            className={`relative rounded-full px-3 py-1.5 text-xs transition-colors ${day === null ? "text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            {day === null && <motion.span layoutId="day-pill" className="absolute inset-0 rounded-full bg-foreground" />}
            <span className="relative z-10">Каждый день</span>
          </button>
          {DAY_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => setDay(i)}
              className={`relative rounded-full px-3 py-1.5 text-xs transition-colors ${day === i ? "text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              {day === i && <motion.span layoutId="day-pill" className="absolute inset-0 rounded-full bg-foreground" />}
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => setAiOpen((v) => !v)}
        className="mb-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-border bg-card text-sm hover:bg-accent"
      >
        <Wand2 className="h-4 w-4" />
        Создать расписание через AI
      </button>

      <AnimatePresence>
        {aiOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-2 text-xs text-muted-foreground">
                Опиши свой день ({dayLabel}) — AI превратит это в расписание и заменит текущее.
              </div>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
                placeholder="Например: подъём в 7, зарядка, душ, завтрак, работа с 9 до 18, обед в 13, спорт в 19, ужин, чтение, сон в 23"
                className="w-full resize-none rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-foreground"
              />
              <button
                onClick={runAi}
                disabled={aiLoading || !aiPrompt.trim()}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40"
              >
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {aiLoading ? "Делаю расписание…" : "Сгенерировать"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={add} className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Добавить дело в расписание…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="h-12 flex-1 rounded-2xl border border-input bg-card px-4 text-sm outline-none focus:border-foreground"
        />
        <button type="submit" disabled={adding || !newTitle.trim()} className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background disabled:opacity-40">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
        </button>
      </form>

      {loading ? <Loader /> : routines.length === 0 ? (
        <Empty text="Тут пока пусто. Добавь дела или сгенерируй через AI." />
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {routines.map((r) => (
              <motion.li
                key={r.id} layout
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
              >
                {r.time_of_day && (
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">{r.time_of_day}</span>
                )}
                <span className="flex-1 text-sm">{r.title}</span>
                <button onClick={() => remove(r)} aria-label="Удалить" className="text-muted-foreground hover:text-destructive">
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

// ============= GAMING =============
type GamingStats = {
  steam_total_minutes: number | null;
  steam_top_games: { name: string; hours: number }[] | null;
  faceit_elo: number | null;
  faceit_level: number | null;
  faceit_kd: number | null;
  faceit_winrate: number | null;
  faceit_recent: { competition: string | null; status: string | null; finished_at: number | null }[] | null;
  last_synced_at: string | null;
};

function GamingSection() {
  const sync = useServerFn(syncGaming);
  const [steamId, setSteamId] = useState("");
  const [faceit, setFaceit] = useState("");
  const [stats, setStats] = useState<GamingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const [{ data: profile }, { data: gs }] = await Promise.all([
      supabase.from("profiles").select("steam_id, faceit_nickname").eq("id", u.user.id).maybeSingle(),
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

  const steamHours = stats?.steam_total_minutes != null ? Math.round(stats.steam_total_minutes / 60) : null;

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 text-sm text-muted-foreground">Подключи аккаунты — AI будет видеть статистику.</div>
        <div className="mb-3">
          <div className="mb-1 text-xs text-muted-foreground">Steam ID (64-bit)</div>
          <input value={steamId} onChange={(e) => setSteamId(e.target.value)} placeholder="76561198..."
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-foreground" />
        </div>
        <div className="mb-3">
          <div className="mb-1 text-xs text-muted-foreground">Faceit nickname</div>
          <input value={faceit} onChange={(e) => setFaceit(e.target.value)} placeholder="ник"
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-foreground" />
        </div>
        <button onClick={run} disabled={syncing} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {syncing ? "Синхронизирую…" : "Синхронизировать"}
        </button>
        {stats?.last_synced_at && (
          <div className="mt-2 text-center text-xs text-muted-foreground">Обновлено {formatDate(stats.last_synced_at)}</div>
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
              {stats.faceit_level != null && <Stat label="Уровень" value={String(stats.faceit_level)} />}
              {stats.faceit_kd != null && <Stat label="K/D" value={stats.faceit_kd.toFixed(2)} />}
              {stats.faceit_winrate != null && <Stat label="Winrate" value={`${stats.faceit_winrate}%`} />}
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

// ============= CUSTOM METRICS =============
type Metric = { id: string; name: string; kind: string; unit: string | null; icon: string | null; sort_order: number };
type MetricLog = { id: string; metric_id: string; log_date: string; value_num: number | null; value_text: string | null; created_at: string };

function MetricsSection() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [logs, setLogs] = useState<MetricLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"number" | "text">("number");
  const [newUnit, setNewUnit] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const since = new Date(); since.setDate(since.getDate() - 14);
    const sinceIso = since.toISOString().slice(0, 10);
    const [{ data: m }, { data: l }] = await Promise.all([
      supabase.from("custom_metrics").select("*").order("sort_order"),
      supabase.from("custom_metric_logs").select("*").gte("log_date", sinceIso).order("created_at", { ascending: false }),
    ]);
    setMetrics((m ?? []) as Metric[]);
    setLogs((l ?? []) as MetricLog[]);
    setLoading(false);
  }

  async function addMetric(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("custom_metrics").insert({
      user_id: u.user!.id,
      name: newName.trim(),
      kind: newKind,
      unit: newUnit.trim() || null,
      sort_order: metrics.length,
    }).select("*").single();
    if (error) toast.error(error.message);
    else if (data) {
      setMetrics((ms) => [...ms, data as Metric]);
      setNewName(""); setNewUnit("");
    }
  }

  async function removeMetric(id: string) {
    if (!confirm("Удалить метрику и все её записи?")) return;
    setMetrics((ms) => ms.filter((m) => m.id !== id));
    await supabase.from("custom_metrics").delete().eq("id", id);
    setLogs((ls) => ls.filter((l) => l.metric_id !== id));
  }

  async function logValue(metric: Metric, raw: string) {
    if (!raw.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const today = new Date().toISOString().slice(0, 10);
    const payload = {
      user_id: u.user!.id,
      metric_id: metric.id,
      log_date: today,
      value_num: metric.kind === "number" ? parseFloat(raw) : null,
      value_text: metric.kind === "text" ? raw.trim() : null,
    };
    const { data, error } = await supabase.from("custom_metric_logs").insert(payload).select("*").single();
    if (error) toast.error(error.message);
    else if (data) {
      setLogs((ls) => [data as MetricLog, ...ls]);
      toast.success("Записано");
    }
  }

  async function removeLog(id: string) {
    setLogs((ls) => ls.filter((l) => l.id !== id));
    await supabase.from("custom_metric_logs").delete().eq("id", id);
  }

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Создай свои переменные — например «Кофе чашек», «Настроение», «Время в коде». AI будет анализировать всё.
      </div>

      <form onSubmit={addMetric} className="mb-6 rounded-2xl border border-border bg-card p-4">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Название метрики"
          className="mb-3 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-foreground" />
        <div className="mb-3 flex gap-2">
          {(["number", "text"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setNewKind(k)}
              className={`h-10 flex-1 rounded-xl border text-xs transition-colors ${newKind === k ? "border-foreground bg-foreground text-background" : "border-input text-muted-foreground hover:text-foreground"}`}>
              {k === "number" ? "Число" : "Текст"}
            </button>
          ))}
        </div>
        {newKind === "number" && (
          <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="Единицы (необязательно): чашек, км, мин"
            className="mb-3 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-foreground" />
        )}
        <button type="submit" disabled={!newName.trim()} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40">
          <Plus className="h-4 w-4" /> Создать метрику
        </button>
      </form>

      {loading ? <Loader /> : metrics.length === 0 ? <Empty text="Пока нет метрик." /> : (
        <ul className="flex flex-col gap-3">
          {metrics.map((m) => (
            <MetricCard key={m.id} metric={m} logs={logs.filter((l) => l.metric_id === m.id)}
              onLog={(v) => logValue(m, v)} onRemove={() => removeMetric(m.id)} onRemoveLog={removeLog} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MetricCard({ metric, logs, onLog, onRemove, onRemoveLog }: {
  metric: Metric; logs: MetricLog[];
  onLog: (v: string) => void | Promise<void>;
  onRemove: () => void;
  onRemoveLog: (id: string) => void;
}) {
  const [val, setVal] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await onLog(val);
    setVal("");
  }
  return (
    <li className="group rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{metric.name}</div>
          <div className="text-xs text-muted-foreground">{metric.kind === "number" ? `Число${metric.unit ? ` · ${metric.unit}` : ""}` : "Текст"}</div>
        </div>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <form onSubmit={submit} className="mb-3 flex gap-2">
        <input
          type={metric.kind === "number" ? "number" : "text"}
          step="any"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={metric.kind === "number" ? `Сегодня ${metric.unit ?? ""}` : "Что записать?"}
          className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-foreground"
        />
        <button type="submit" disabled={!val.trim()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background disabled:opacity-40">
          <Plus className="h-4 w-4" />
        </button>
      </form>
      {logs.length > 0 && (
        <ul className="space-y-1 text-xs">
          {logs.slice(0, 5).map((l) => (
            <li key={l.id} className="flex items-center justify-between text-muted-foreground">
              <span>{l.log_date} · {l.value_num != null ? `${l.value_num}${metric.unit ? ` ${metric.unit}` : ""}` : l.value_text}</span>
              <button onClick={() => onRemoveLog(l.id)} className="opacity-60 hover:opacity-100 hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
