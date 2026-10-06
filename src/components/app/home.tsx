import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Moon,
  Plus,
  Repeat,
  Ruler,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { dailyBrief } from "@/lib/ai.functions";
import { remindNow } from "@/lib/reminders";
import {
  enablePush,
  getPushStatus,
  requestTestPush,
  syncPushSubscription,
  type PushStatus,
} from "@/lib/push";
import {
  loadTasks,
  localIso,
  PLANNER_CHANGED,
  saveSubtasks,
  setTaskCompleted,
  withSubtaskToggled,
  type PlannerTask,
} from "@/lib/planner";
import { AppSheet } from "@/components/ui/app-sheet";
import { useHideDone } from "@/lib/use-local-flag";
import { SubtaskCount, SubtaskList, TaskEditor } from "@/components/planner-sections";
import { getLang, getLocale, tr } from "@/lib/i18n";

export type Section = "home" | "plans" | "settings" | "journal" | "sleep" | "ai" | "metrics";

type Brief = { emoji: string; mood: string; message: string; tips: string[] };

const minutesOf = (time: string | null) => {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** The task to focus on now: one in progress (started < 45 min ago), else the next one. */
function pickFocus(tasks: PlannerTask[], nowMin: number) {
  const timed = tasks
    .filter((t) => !t.completed && t.scheduled_time)
    .map((t) => ({ task: t, start: minutesOf(t.scheduled_time)! }))
    .sort((a, b) => a.start - b.start);
  const current = [...timed].reverse().find((t) => t.start <= nowMin && nowMin - t.start < 45);
  const next = timed.find((t) => t.start > nowMin);
  const waiting = timed.filter((t) => t.start <= nowMin && t !== current);
  return { current, next, waiting };
}

function formatIn(minutes: number) {
  if (minutes < 1) return tr("сейчас");
  if (minutes < 60) return tr("через {0} мин", { 0: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? tr("через {0} ч {1} мин", { 0: h, 1: m }) : tr("через {0} ч", { 0: h });
}

export function HomeSection({ onGo }: { onGo: (s: Section) => void }) {
  const [tasks, setTasks] = useState<PlannerTask[] | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [adding, setAdding] = useState(false);
  const today = localIso(now);

  const refresh = useCallback(async () => {
    try {
      setTasks(await loadTasks(localIso()));
    } catch {
      setTasks((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener(PLANNER_CHANGED, onChange);
    // Keep "now / next" live; also rolls over at midnight.
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.removeEventListener(PLANNER_CHANGED, onChange);
      clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [today, refresh]);

  async function toggle(task: PlannerTask) {
    const completed = !task.completed;
    const subtasks = completed ? task.subtasks.map((st) => ({ ...st, done: true })) : task.subtasks;
    setTasks(
      (list) => list?.map((t) => (t.id === task.id ? { ...t, completed, subtasks } : t)) ?? list,
    );
    try {
      await setTaskCompleted(task, completed);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Не удалось сохранить"));
      void refresh();
    }
  }

  async function toggleSubtask(task: PlannerTask, subtaskId: string) {
    const next = withSubtaskToggled(task, subtaskId);
    setTasks((list) => list?.map((t) => (t.id === task.id ? next : t)) ?? list);
    try {
      await saveSubtasks(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Не удалось сохранить"));
      void refresh();
    }
  }

  const list = tasks ?? [];
  const done = list.filter((t) => t.completed).length;

  return (
    // Phone: one column. Desktop: the day plan gets its own column on the right
    // (the left wrapper is display:contents on phones, so `order` interleaves).
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
      <div className="contents lg:flex lg:flex-col lg:gap-5">
        <div className="order-1 lg:order-none">
          <DayProgress done={done} total={list.length} loading={tasks === null} />
        </div>
        <div className="order-2 lg:order-none">
          <NowNext
            tasks={list}
            now={now}
            onDone={toggle}
            onToggleSubtask={toggleSubtask}
            onAdd={() => setAdding(true)}
          />
        </div>
        <div className="order-4 lg:order-none">
          <QuickActions onAdd={() => setAdding(true)} onGo={onGo} />
        </div>
        <div className="order-5 lg:order-none">
          <BriefCard onGo={onGo} />
        </div>
        <div className="order-6 lg:order-none">
          <RemindersButton />
        </div>
      </div>
      {list.length > 0 && (
        <div className="order-3 lg:sticky lg:top-6 lg:order-none">
          <Timeline tasks={list} now={now} onToggle={toggle} onAll={() => onGo("plans")} />
        </div>
      )}

      <AppSheet open={adding} onClose={() => setAdding(false)}>
        <TaskEditor
          task={null}
          editAllFuture={false}
          defaultDate={today}
          onClose={() => setAdding(false)}
          onSaved={() => setAdding(false)}
        />
      </AppSheet>
    </div>
  );
}

function DayProgress({ done, total, loading }: { done: number; total: number; loading: boolean }) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="rounded-3xl bg-card p-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{tr("Сегодня")}</p>
          <p className="mt-1 font-serif text-3xl leading-none">
            {loading ? "—" : total ? tr("{0} из {1}", { 0: done, 1: total }) : tr("Свободный день")}
          </p>
        </div>
        {total > 0 && <p className="font-mono text-sm tabular-nums">{percent}%</p>}
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full origin-left rounded-full bg-foreground transition-transform duration-700 ease-out"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>
    </div>
  );
}

function NowNext({
  tasks,
  now,
  onDone,
  onToggleSubtask,
  onAdd,
}: {
  tasks: PlannerTask[];
  now: Date;
  onDone: (task: PlannerTask) => void;
  onToggleSubtask: (task: PlannerTask, subtaskId: string) => void;
  onAdd: () => void;
}) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const { current, next, waiting } = pickFocus(tasks, nowMin);
  const untimed = tasks.filter((t) => !t.completed && !t.scheduled_time);
  const overdue = waiting.length;

  let label = "";
  let focus: PlannerTask | null = null;
  let meta = "";
  if (current) {
    label = tr("Сейчас");
    focus = current.task;
    meta = tr("с {0}", { 0: current.task.scheduled_time!.slice(0, 5) });
  } else if (next) {
    label = tr("Дальше");
    focus = next.task;
    meta = `${next.task.scheduled_time!.slice(0, 5)} · ${formatIn(next.start - nowMin)}`;
  } else if (untimed.length) {
    label = tr("Без времени");
    focus = untimed[0];
    meta =
      untimed.length > 1 ? tr("и ещё {0}", { 0: untimed.length - 1 }) : tr("последнее на сегодня");
  }

  if (!focus) {
    const allDone = tasks.length > 0;
    return (
      <div className="rounded-3xl bg-card p-5">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {allDone ? tr("Готово") : tr("План пуст")}
        </p>
        <p className="mt-2 text-lg">
          {allDone ? tr("Все дела на сегодня сделаны 🎉") : tr("Добавь первое дело на сегодня")}
        </p>
        {!allDone && (
          <button
            onClick={onAdd}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background"
          >
            <Plus className="h-4 w-4" /> {tr("Добавить дело")}
          </button>
        )}
      </div>
    );
  }

  const target = focus;
  return (
    <div className="relative overflow-hidden rounded-3xl bg-foreground p-5 text-background">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-60">
        {label === tr("Сейчас") && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        )}
        {label}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={target.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          <p className="mt-2 font-serif text-3xl leading-tight">{target.title}</p>
          <p className="mt-1 text-sm opacity-60">
            {meta}
            {target.routine_id && tr(" · повтор")}
            {target.subtasks.length > 0 &&
              ` · ${target.subtasks.filter((st) => st.done).length}/${target.subtasks.length}`}
          </p>
          {target.subtasks.length > 0 && (
            <div className="mt-3">
              <SubtaskList
                inverted
                subtasks={target.subtasks}
                onToggle={(id) => onToggleSubtask(target, id)}
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          onClick={() => onDone(target)}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-background px-5 text-sm font-medium text-foreground"
        >
          <Check className="h-4 w-4" /> {tr("Готово")}
        </button>
        {overdue > 0 && (
          <span className="text-xs opacity-60">
            {overdue} {tr("пропущено раньше")}
          </span>
        )}
      </div>
    </div>
  );
}

function Timeline({
  tasks,
  now,
  onToggle,
  onAll,
}: {
  tasks: PlannerTask[];
  now: Date;
  onToggle: (task: PlannerTask) => void;
  onAll: () => void;
}) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const sorted = useMemo(
    () =>
      [...tasks].sort(
        (a, b) =>
          (minutesOf(a.scheduled_time) ?? 24 * 60) - (minutesOf(b.scheduled_time) ?? 24 * 60) ||
          a.sort_order - b.sort_order,
      ),
    [tasks],
  );
  const [hideDone, toggleHideDone] = useHideDone();
  const doneCount = tasks.filter((t) => t.completed).length;
  const shown = hideDone ? sorted.filter((t) => !t.completed) : sorted;
  const timed = shown.filter((t) => t.scheduled_time);
  const untimed = shown.filter((t) => !t.scheduled_time);
  // Same focus as the "Сейчас / Дальше" card; earlier unfinished items are "missed".
  const { current, next, waiting } = pickFocus(tasks, nowMin);
  const focusId = (current ?? next)?.task.id;
  const missed = new Set(waiting.map((w) => w.task.id));

  const row = (task: PlannerTask, highlight: boolean) => {
    const past = missed.has(task.id);
    return (
      <li
        key={task.id}
        className={`flex min-h-12 items-center gap-3 px-4 py-2 transition-colors ${highlight ? "bg-accent" : ""}`}
      >
        <span
          className={`w-11 shrink-0 font-mono text-xs tabular-nums ${past ? "text-destructive/80" : "text-muted-foreground"}`}
        >
          {task.scheduled_time?.slice(0, 5) ?? "—"}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-[15px] transition-colors duration-300 ${task.completed ? "text-muted-foreground line-through" : ""}`}
        >
          {task.title}
          {task.subtasks.length > 0 && <SubtaskCount subtasks={task.subtasks} />}
          {task.routine_id && (
            <Repeat className="ml-1.5 inline h-3 w-3 align-baseline text-muted-foreground" />
          )}
        </span>
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={() => onToggle(task)}
          aria-label={task.completed ? tr("Вернуть") : tr("Выполнить")}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${task.completed ? "border-foreground bg-foreground text-background" : "border-muted-foreground/60"}`}
        >
          {task.completed && <Check className="h-4 w-4" strokeWidth={3} />}
        </motion.button>
      </li>
    );
  };

  return (
    <div className="overflow-hidden rounded-3xl bg-card">
      <button
        onClick={onAll}
        className="flex w-full items-center justify-between px-4 pb-2 pt-4 text-xs uppercase tracking-widest text-muted-foreground"
      >
        {tr("План на день")} <ChevronRight className="h-4 w-4" />
      </button>
      {doneCount > 0 && (
        <button
          onClick={toggleHideDone}
          className="flex w-full items-center justify-between px-4 pb-2 text-xs text-muted-foreground"
        >
          <span className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" />
            {tr("Выполнено:")} {doneCount}
          </span>
          <span className="flex items-center gap-1 text-foreground">
            {hideDone ? tr("Показать") : tr("Свернуть")}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${hideDone ? "" : "rotate-180"}`}
            />
          </span>
        </button>
      )}
      <ul className="divide-y divide-border">{timed.map((t) => row(t, t.id === focusId))}</ul>
      {untimed.length > 0 && (
        <>
          <p className="px-4 pb-1 pt-4 text-xs uppercase tracking-widest text-muted-foreground">
            {tr("Без времени")}
          </p>
          <ul className="divide-y divide-border">{untimed.map((t) => row(t, false))}</ul>
        </>
      )}
    </div>
  );
}

function QuickActions({ onAdd, onGo }: { onAdd: () => void; onGo: (s: Section) => void }) {
  const items = [
    { label: tr("Дело"), icon: Plus, action: onAdd, primary: true },
    {
      label: tr("Повторы"),
      icon: CalendarClock,
      action: () => {
        onGo("plans");
        setTimeout(
          () => document.getElementById("repeats")?.scrollIntoView({ behavior: "smooth" }),
          100,
        );
      },
    },
    { label: tr("Сон"), icon: Moon, action: () => onGo("sleep") },
    { label: tr("Метрики"), icon: Ruler, action: () => onGo("metrics") },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(({ label, icon: Icon, action, primary }) => (
        <button
          key={label}
          onClick={action}
          className={`flex flex-col items-center gap-2 rounded-2xl py-4 text-xs ${primary ? "bg-foreground text-background" : "bg-card"}`}
        >
          <Icon className="h-5 w-5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function BriefCard({ onGo }: { onGo: (s: Section) => void }) {
  const brief = useServerFn(dailyBrief);
  const [data, setData] = useState<Brief | null>(null);
  const [showTips, setShowTips] = useState(false);

  useEffect(() => {
    const cacheKey = `lumen-brief-${localIso()}-${getLang()}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setData(JSON.parse(cached));
        return;
      }
    } catch {
      // No storage (private mode): just fetch.
    }
    (async () => {
      try {
        const r = await brief({ data: { today: localIso() } });
        setData(r);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(r));
        } catch {
          // Not cached; fine.
        }
      } catch {
        setData({ emoji: "🙂", mood: "", message: tr("Я рядом. Расскажи, как день?"), tips: [] });
      }
    })();
  }, [brief]);

  return (
    <div className="rounded-3xl bg-card p-5">
      <div className="flex items-start gap-4">
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: data ? 1 : 0.3 }}
          transition={{ type: "spring", bounce: 0.45 }}
          className="text-4xl leading-none"
        >
          {data?.emoji ?? "✨"}
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-3 w-3" /> {data?.mood || "Lumen AI"}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed">
            {data?.message ?? tr("Собираю мысли про твой день…")}
          </p>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {showTips && !!data?.tips?.length && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-2 overflow-hidden"
          >
            {data.tips.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground" />
                {t}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onGo("ai")}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-medium text-background"
        >
          <Sparkles className="h-4 w-4" /> {tr("Поговорить")}
        </button>
        {!!data?.tips?.length && (
          <button
            onClick={() => setShowTips((v) => !v)}
            className="inline-flex h-10 items-center rounded-full bg-secondary px-4 text-sm"
          >
            {showTips ? tr("Скрыть советы") : tr("Советы · {0}", { 0: data.tips.length })}
          </button>
        )}
      </div>
    </div>
  );
}

function RemindersButton() {
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    void getPushStatus().then(setPushStatus);
    void syncPushSubscription();
  }, []);

  async function enableNotifications() {
    setEnabling(true);
    try {
      await enablePush();
      await requestTestPush();
      setPushStatus("on");
      toast.success(tr("Готово! В течение минуты придёт тестовое уведомление"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Не удалось включить уведомления"));
      setPushStatus(await getPushStatus());
    } finally {
      setEnabling(false);
    }
  }

  const base =
    "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-card text-sm disabled:opacity-50";
  if (pushStatus === "needs-install")
    return (
      <p className="rounded-3xl bg-card p-4 text-center text-sm text-muted-foreground">
        {tr(
          "Чтобы получать напоминания, добавь Lumen на экран «Домой» (Поделиться → На экран «Домой») и открой оттуда.",
        )}
      </p>
    );
  if (pushStatus && pushStatus !== "on")
    return (
      <button onClick={enableNotifications} disabled={enabling} className={base}>
        <Bell className="h-4 w-4" /> {enabling ? tr("Включаю…") : tr("Включить напоминания")}
      </button>
    );
  if (pushStatus === "on")
    return (
      <button
        onClick={async () => {
          const left = await remindNow();
          toast.success(
            left === 0 ? tr("Всё сделано на сегодня 🎉") : tr("Осталось дел: {0}", { 0: left }),
          );
        }}
        className={base}
      >
        <Bell className="h-4 w-4" /> {tr("Что я ещё не сделал")}
      </button>
    );
  return null;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 6) return tr("Доброй ночи");
  if (h < 12) return tr("Доброе утро");
  if (h < 18) return tr("Добрый день");
  return tr("Добрый вечер");
}

export function todayLabel() {
  return new Intl.DateTimeFormat(getLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}
