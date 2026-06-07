import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "@/integrations/supabase/client";
import { LumenLogo } from "@/components/lumen-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Check, Plus, LogOut, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Scope = "day" | "week" | "month";

type Task = {
  id: string;
  title: string;
  scope: Scope;
  completed: boolean;
  scheduled_for: string;
};

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Lumen — твой день" }] }),
  component: AppPage,
});

const SCOPES: { id: Scope; label: string }[] = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
];

function AppPage() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>("day");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: profile } = await supabase.auth.getUser();
      setName(profile.user?.user_metadata?.name || profile.user?.email?.split("@")[0] || "");
      await loadTasks();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTasks() {
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, scope, completed, scheduled_for")
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    else setTasks((data ?? []) as Task[]);
    setLoading(false);
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("tasks")
      .insert({ title: newTitle.trim(), scope, user_id: u.user!.id })
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
    if (error) {
      toast.error(error.message);
      setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, completed: !next } : t)));
    }
  }

  async function remove(task: Task) {
    setTasks((ts) => ts.filter((t) => t.id !== task.id));
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) toast.error(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const filtered = tasks.filter((t) => t.scope === scope);
  const done = filtered.filter((t) => t.completed).length;
  const total = filtered.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-glow" />

      <header className="relative z-10 mx-auto flex max-w-3xl items-center justify-between px-5 pt-6 sm:px-8">
        <LumenLogo />
        <div className="flex items-center gap-2">
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

      <main className="relative z-10 mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-8">
          <div className="text-sm text-muted-foreground">
            {greeting()}{name ? ", " + name : ""}.
          </div>
          <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">
            {todayLabel()}
          </h1>
        </div>

        {/* Progress */}
        <div className="mb-6 rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Прогресс</span>
            <span className="font-medium">{done} / {total}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <motion.div
              className="h-full bg-foreground"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        {/* Scope tabs */}
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
                <motion.span
                  layoutId="scope-pill"
                  className="absolute inset-0 rounded-full bg-foreground"
                  transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
                />
              )}
              <span className="relative z-10">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Add task */}
        <form onSubmit={addTask} className="mb-6 flex gap-2">
          <input
            type="text"
            placeholder={`Добавить задачу на ${scopeLabel(scope)}…`}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="h-12 flex-1 rounded-2xl border border-input bg-card px-4 text-sm outline-none transition-colors focus:border-foreground"
          />
          <button
            type="submit"
            disabled={adding || !newTitle.trim()}
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
          </button>
        </form>

        {/* Tasks */}
        {loading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
            Пока пусто. Добавь первую задачу.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {filtered.map((task) => (
                <motion.li
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  className="group flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:bg-surface"
                >
                  <button
                    onClick={() => toggle(task)}
                    aria-label="Отметить"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      task.completed
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground"
                    }`}
                  >
                    {task.completed && <Check className="h-3 w-3" strokeWidth={3} />}
                  </button>
                  <span className={`flex-1 text-sm ${task.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {task.title}
                  </span>
                  <button
                    onClick={() => remove(task)}
                    aria-label="Удалить"
                    className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card/40 p-5 text-sm text-muted-foreground">
          <div className="mb-1 text-foreground">Скоро</div>
          Дневник мыслей, отслеживание сна, тренировок, статистика и AI-анализ недели появятся в следующих обновлениях.
        </div>
      </main>
    </div>
  );
}

function scopeLabel(s: Scope) {
  return s === "day" ? "день" : s === "week" ? "неделю" : "месяц";
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
