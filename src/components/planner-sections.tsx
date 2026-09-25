import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "motion/react";
import { Check, GripVertical, Pencil, Plus, Repeat, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AppSheet } from "@/components/ui/app-sheet";
import { supabase } from "@/integrations/supabase/client";
import {
  addDays,
  createRoutine,
  createTask,
  endRoutine,
  loadRoutines,
  loadTasks,
  localIso,
  removeTask,
  setRoutineActive,
  updateRoutineFuture,
  updateTaskInstance,
  type PlannerRoutine,
  type PlannerTask,
} from "@/lib/planner";
import { parseScheduleLines } from "@/lib/routine-schedule";

const SHORT_DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];
type View = "day" | "week" | "month";
type ScopeAction = { task: PlannerTask; mode: "edit" | "delete" } | null;

const formatShortDate = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(
    new Date(`${iso}T12:00:00`),
  );

export function PlansSection() {
  const [view, setView] = useState<View>("day");
  const [selectedDate, setSelectedDate] = useState(localIso());
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PlannerTask | null>(null);
  const [editAllFuture, setEditAllFuture] = useState(false);
  const [scopeAction, setScopeAction] = useState<ScopeAction>(null);

  const range = useMemo(() => {
    if (view === "day") return { from: selectedDate, to: selectedDate };
    if (view === "week") {
      const date = new Date(`${selectedDate}T12:00:00`);
      const mondayOffset = date.getDay() === 0 ? -6 : 1 - date.getDay();
      const from = addDays(selectedDate, mondayOffset);
      return { from, to: addDays(from, 6) };
    }
    const date = new Date(`${selectedDate}T12:00:00`);
    const from = localIso(new Date(date.getFullYear(), date.getMonth(), 1));
    const to = localIso(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    return { from, to };
  }, [selectedDate, view]);

  const closeEditor = () => {
    setAdding(false);
    setEditing(null);
  };

  async function refresh() {
    setLoading(true);
    try {
      setTasks(await loadTasks(range.from, range.to));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить планы");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [range.from, range.to]);

  async function toggle(task: PlannerTask) {
    const completed = !task.completed;
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, completed, completed_at: completed ? new Date().toISOString() : null }
          : item,
      ),
    );
    const { error } = await supabase
      .from("tasks")
      .update({ completed, completed_at: completed ? new Date().toISOString() : null })
      .eq("id", task.id);
    if (error) {
      toast.error(error.message);
      void refresh();
    }
  }

  function requestEdit(task: PlannerTask) {
    if (task.routine_id) setScopeAction({ task, mode: "edit" });
    else {
      setEditAllFuture(false);
      setEditing(task);
    }
  }

  function requestDelete(task: PlannerTask) {
    if (task.routine_id) setScopeAction({ task, mode: "delete" });
    else void deleteTask(task, false);
  }

  async function deleteTask(task: PlannerTask, allFuture: boolean) {
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setScopeAction(null);
    try {
      await removeTask(task, allFuture);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить");
      void refresh();
    }
  }

  const selectedTasks = tasks.filter((task) => task.scheduled_for === selectedDate);
  const done = selectedTasks.filter((task) => task.completed).length;
  const percent = selectedTasks.length ? Math.round((done / selectedTasks.length) * 100) : 0;

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{formatShortDate(selectedDate)}</p>
          <h2 className="font-serif text-3xl">Планы</h2>
        </div>
        <Button
          size="icon"
          className="rounded-full"
          onClick={() => setAdding(true)}
          aria-label="Добавить задачу"
        >
          <Plus />
        </Button>
      </div>

      <div className="grid grid-cols-3 border-b border-border">
        {(
          [
            ["day", "Сегодня"],
            ["week", "Неделя"],
            ["month", "Месяц"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`border-b-2 px-3 py-3 text-sm ${view === id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "week" && (
        <WeekStrip
          from={range.from}
          selected={selectedDate}
          tasks={tasks}
          onSelect={setSelectedDate}
        />
      )}
      {view === "month" && (
        <MonthGrid
          month={selectedDate}
          selected={selectedDate}
          tasks={tasks}
          onSelect={setSelectedDate}
        />
      )}

      <div className="space-y-2 border-b border-border pb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Выполнено</span>
          <strong>
            {done}/{selectedTasks.length} · {percent}%
          </strong>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-secondary">
          <motion.div
            className="h-full rounded-full bg-foreground"
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ type: "spring", damping: 26, stiffness: 180 }}
          />
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Загрузка…</div>
      ) : (
        <TaskList
          tasks={selectedTasks}
          onToggle={toggle}
          onEdit={requestEdit}
          onDelete={requestDelete}
        />
      )}

      <AppSheet open={adding || !!editing} onClose={closeEditor}>
        <TaskEditor
          key={editing?.id ?? "new"}
          task={editing}
          editAllFuture={editAllFuture}
          defaultDate={selectedDate}
          onClose={closeEditor}
          onSaved={() => {
            closeEditor();
            void refresh();
          }}
        />
      </AppSheet>
      <AppSheet open={!!scopeAction} onClose={() => setScopeAction(null)}>
        {scopeAction && (
          <ScopeDialog
            action={scopeAction}
            onCancel={() => setScopeAction(null)}
            onToday={() => {
              if (scopeAction.mode === "delete") void deleteTask(scopeAction.task, false);
              else {
                setEditAllFuture(false);
                setEditing(scopeAction.task);
                setScopeAction(null);
              }
            }}
            onFuture={() => {
              if (scopeAction.mode === "delete") void deleteTask(scopeAction.task, true);
              else {
                setEditAllFuture(true);
                setEditing(scopeAction.task);
                setScopeAction(null);
              }
            }}
          />
        )}
      </AppSheet>
    </section>
  );
}

function TaskList({
  tasks,
  onToggle,
  onEdit,
  onDelete,
}: {
  tasks: PlannerTask[];
  onToggle: (task: PlannerTask) => void;
  onEdit: (task: PlannerTask) => void;
  onDelete: (task: PlannerTask) => void;
}) {
  const timed = tasks
    .filter((task) => task.scheduled_time)
    .sort(
      (a, b) =>
        (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? "") ||
        a.sort_order - b.sort_order,
    );
  const untimed = tasks
    .filter((task) => !task.scheduled_time)
    .sort((a, b) => a.sort_order - b.sort_order);
  if (!tasks.length)
    return (
      <div className="rounded-2xl bg-card py-12 text-center text-sm text-muted-foreground">
        На этот день ничего не запланировано
      </div>
    );
  return (
    <div className="space-y-7">
      <TaskGroup tasks={timed} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
      {untimed.length > 0 && (
        <div>
          <h3 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Без времени
          </h3>
          <TaskGroup tasks={untimed} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
        </div>
      )}
    </div>
  );
}

function TaskGroup({
  tasks,
  onToggle,
  onEdit,
  onDelete,
}: {
  tasks: PlannerTask[];
  onToggle: (task: PlannerTask) => void;
  onEdit: (task: PlannerTask) => void;
  onDelete: (task: PlannerTask) => void;
}) {
  return (
    <ul className="overflow-hidden rounded-2xl bg-card">
      <AnimatePresence initial={false}>
        {tasks.map((task) => (
          <motion.li
            key={task.id}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="border-b border-border last:border-b-0"
          >
            <div className="flex min-h-14 items-center gap-3 py-2 pl-4 pr-1">
              <motion.button
                onClick={() => onToggle(task)}
                whileTap={{ scale: 0.8 }}
                aria-label={task.completed ? "Вернуть задачу" : "Выполнить задачу"}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${task.completed ? "border-foreground bg-foreground text-background" : "border-muted-foreground/60"}`}
              >
                <AnimatePresence initial={false}>
                  {task.completed && (
                    <motion.span
                      initial={{ scale: 0, rotate: -30 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0 }}
                      transition={{ type: "spring", damping: 14, stiffness: 420 }}
                    >
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
              <button
                type="button"
                onClick={() => onEdit(task)}
                aria-label={`Изменить «${task.title}»`}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="w-11 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {task.scheduled_time?.slice(0, 5) ?? "—"}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block break-words text-[15px] transition-colors duration-300 ${task.completed ? "text-muted-foreground line-through decoration-muted-foreground/60" : ""}`}
                  >
                    {task.title}
                  </span>
                  {task.routine_id && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Repeat className="h-3 w-3" /> Рутина
                    </span>
                  )}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground/70"
                onClick={() => onDelete(task)}
                aria-label="Удалить"
              >
                <Trash2 />
              </Button>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function WeekStrip({
  from,
  selected,
  tasks,
  onSelect,
}: {
  from: string;
  selected: string;
  tasks: PlannerTask[];
  onSelect: (iso: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 7 }, (_, index) => addDays(from, index)).map((iso) => {
        const date = new Date(`${iso}T12:00:00`);
        const count = tasks.filter((task) => task.scheduled_for === iso).length;
        return (
          <button
            key={iso}
            onClick={() => onSelect(iso)}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-md py-2 text-xs ${selected === iso ? "bg-foreground text-background" : "text-muted-foreground"}`}
          >
            <span>{SHORT_DAYS[date.getDay()]}</span>
            <strong className="text-sm">{date.getDate()}</strong>
            <span className="h-1 text-[9px]">{count || ""}</span>
          </button>
        );
      })}
    </div>
  );
}

function MonthGrid({
  month,
  selected,
  tasks,
  onSelect,
}: {
  month: string;
  selected: string;
  tasks: PlannerTask[];
  onSelect: (iso: string) => void;
}) {
  const base = new Date(`${month}T12:00:00`);
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const offset = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const start = localIso(new Date(base.getFullYear(), base.getMonth(), 1 - offset));
  return (
    <div>
      <div className="mb-2 grid grid-cols-7 text-center text-[10px] text-muted-foreground">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((iso) => {
          const date = new Date(`${iso}T12:00:00`);
          const inMonth = date.getMonth() === base.getMonth();
          const count = tasks.filter((task) => task.scheduled_for === iso).length;
          return (
            <button
              key={iso}
              onClick={() => onSelect(iso)}
              className={`aspect-square rounded-md text-xs ${selected === iso ? "bg-foreground text-background" : inMonth ? "text-foreground" : "text-muted-foreground/40"}`}
            >
              <span>{date.getDate()}</span>
              {count > 0 && <span className="mx-auto mt-1 block h-1 w-1 rounded-full bg-current" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TaskEditor({
  task,
  editAllFuture,
  defaultDate,
  onClose,
  onSaved,
}: {
  task: PlannerTask | null;
  editAllFuture: boolean;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [date, setDate] = useState(task?.scheduled_for ?? defaultDate);
  const [time, setTime] = useState(task?.scheduled_time?.slice(0, 5) ?? "");
  const [repeat, setRepeat] = useState<"none" | "daily" | "custom">("none");
  const [days, setDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"one" | "list">("one");
  const [listText, setListText] = useState("");
  const listItems = mode === "list" ? parseScheduleLines(listText) : [];
  const seriesEdit = !!task?.routine_id && editAllFuture;
  const canSave =
    (mode === "list" ? listItems.length > 0 : !!title.trim()) &&
    !(repeat === "custom" && !days.length);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      if (task) {
        if (task.routine_id && editAllFuture)
          await updateRoutineFuture(task.routine_id, task.occurrence_date ?? task.scheduled_for, {
            title: title.trim(),
            time_of_day: time || null,
          });
        else
          await updateTaskInstance(task, {
            title: title.trim(),
            scheduled_for: date,
            scheduled_time: time || null,
          });
      } else {
        const repeatDays =
          repeat === "daily" ? [0, 1, 2, 3, 4, 5, 6] : repeat === "custom" ? days : [];
        const items = mode === "list" ? listItems : [{ title: title.trim(), time: time || null }];
        for (const [index, item] of items.entries())
          await createTask({ ...item, date, repeatDays, sortOrder: index });
        if (items.length > 1) toast.success(`Добавлено: ${items.length}`);
      }
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={save}>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-serif text-2xl">
          {task ? (seriesEdit ? "Изменить рутину" : "Изменить задачу") : "Новые дела"}
        </h3>
        <Button type="button" variant="ghost" size="icon" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="space-y-3">
        {!task && (
          <div className="grid grid-cols-2 rounded-full border border-border p-1 text-sm">
            {(
              [
                ["one", "Одно дело"],
                ["list", "Списком"],
              ] as const
            ).map(([id, label]) => (
              <button
                type="button"
                key={id}
                onClick={() => setMode(id)}
                className={`h-9 rounded-full ${mode === id ? "bg-foreground text-background" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {mode === "list" ? (
          <div>
            <textarea
              value={listText}
              onChange={(e) => setListText(e.target.value)}
              rows={6}
              placeholder={"06:00 Подъём\n06:05 Стакан воды\n06:10 Душ\nКупить тетрадь"}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-base outline-none focus:border-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              По строке на дело, время в начале — по желанию.
              {listItems.length > 0 && ` Дел: ${listItems.length}.`}
            </p>
          </div>
        ) : (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название"
            className="h-12 w-full rounded-md border border-input bg-card px-3 text-base outline-none focus:border-foreground"
          />
        )}
        <div
          className={`grid gap-3 ${mode === "list" || seriesEdit ? "grid-cols-1" : "grid-cols-2"}`}
        >
          {!seriesEdit && (
            <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
              {repeat === "none" ? "Дата" : "Начиная с"}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 h-12 w-full rounded-md border border-input bg-card px-3 text-base text-foreground"
              />
            </label>
          )}
          {mode === "one" && (
            <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
              Время
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 h-12 w-full rounded-md border border-input bg-card px-3 text-base text-foreground"
              />
            </label>
          )}
        </div>
        {!task && (
          <>
            <label className="block text-xs text-muted-foreground">
              Повторение
              <select
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as typeof repeat)}
                className="mt-1 h-12 w-full rounded-md border border-input bg-card px-3 text-base text-foreground"
              >
                <option value="none">Нет</option>
                <option value="daily">Каждый день</option>
                <option value="custom">Выбранные дни</option>
              </select>
            </label>
            {repeat === "custom" && <DayPicker value={days} onChange={setDays} />}
          </>
        )}
      </div>
      <Button className="mt-5 h-12 w-full rounded-full" disabled={saving || !canSave}>
        {saving
          ? "Сохраняю…"
          : mode === "list" && listItems.length > 1
            ? `Добавить ${listItems.length}`
            : "Сохранить"}
      </Button>
    </form>
  );
}

function ScopeDialog({
  action,
  onCancel,
  onToday,
  onFuture,
}: {
  action: NonNullable<ScopeAction>;
  onCancel: () => void;
  onToday: () => void;
  onFuture: () => void;
}) {
  return (
    <div>
      <h3 className="font-serif text-2xl">
        {action.mode === "edit" ? "Что изменить?" : "Что удалить?"}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Это дело из рутины. Прошедшие и выполненные дни не изменятся.
      </p>
      <div className="mt-5 space-y-2">
        <Button className="h-11 w-full" onClick={onToday}>
          {action.mode === "edit" ? "Только этот день" : "Пропустить этот день"}
        </Button>
        <Button className="h-11 w-full" variant="secondary" onClick={onFuture}>
          {action.mode === "edit" ? "Этот и следующие" : "Удалить рутину с этого дня"}
        </Button>
        <Button className="h-11 w-full" variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  );
}

function DayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {MONDAY_FIRST.map((day) => (
        <button
          type="button"
          key={day}
          onClick={() =>
            onChange(value.includes(day) ? value.filter((item) => item !== day) : [...value, day])
          }
          className={`aspect-square rounded-full text-xs ${value.includes(day) ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}
        >
          {SHORT_DAYS[day]}
        </button>
      ))}
    </div>
  );
}

export function RoutinesSection() {
  const [routines, setRoutines] = useState<PlannerRoutine[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PlannerRoutine | null>(null);
  const [creating, setCreating] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  async function refresh() {
    setLoading(true);
    try {
      setRoutines(await loadRoutines());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить рутины");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const closeEditor = () => {
    setCreating(false);
    setEditing(null);
  };
  async function dragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = routines.findIndex((r) => r.id === event.active.id);
    const newIndex = routines.findIndex((r) => r.id === event.over?.id);
    const next = arrayMove(routines, oldIndex, newIndex).map((r, i) => ({ ...r, sort_order: i }));
    setRoutines(next);
    await Promise.all(
      next.map((r) =>
        supabase.from("routines").update({ sort_order: r.sort_order }).eq("id", r.id),
      ),
    );
  }
  async function toggle(routine: PlannerRoutine) {
    const active = !routine.active;
    setRoutines((items) =>
      items.map((item) => (item.id === routine.id ? { ...item, active } : item)),
    );
    try {
      await setRoutineActive(routine.id, active);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить");
      void refresh();
    }
  }
  async function remove(routine: PlannerRoutine) {
    if (!confirm(`Удалить «${routine.title}»? Выполненные дни останутся в истории.`)) return;
    try {
      await endRoutine(routine, localIso());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить");
    }
    void refresh();
  }
  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Повторяющиеся дела</p>
          <h2 className="font-serif text-3xl">Рутины</h2>
        </div>
        <Button size="icon" className="rounded-full" onClick={() => setCreating(true)}>
          <Plus />
        </Button>
      </div>
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Загрузка…</div>
      ) : routines.length === 0 ? (
        <div className="rounded-2xl bg-card py-12 text-center text-sm text-muted-foreground">
          Добавь первую рутину
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
          <SortableContext items={routines.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card">
              {routines.map((routine) => (
                <RoutineRow
                  key={routine.id}
                  routine={routine}
                  onToggle={toggle}
                  onEdit={setEditing}
                  onDelete={remove}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <AppSheet open={creating || !!editing} onClose={closeEditor}>
        <RoutineEditor
          key={editing?.id ?? "new"}
          routine={editing}
          onClose={closeEditor}
          onSaved={() => {
            closeEditor();
            void refresh();
          }}
        />
      </AppSheet>
    </section>
  );
}

function RoutineRow({
  routine,
  onToggle,
  onEdit,
  onDelete,
}: {
  routine: PlannerRoutine;
  onToggle: (r: PlannerRoutine) => void;
  onEdit: (r: PlannerRoutine) => void;
  onDelete: (r: PlannerRoutine) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: routine.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex min-h-16 items-center gap-2 bg-card py-2 pr-1 transition-opacity ${routine.active ? "" : "opacity-45"}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="touch-none p-2 text-muted-foreground"
        aria-label="Изменить порядок"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="w-12 font-mono text-xs text-muted-foreground">
        {routine.time_of_day?.slice(0, 5) ?? "—"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{routine.title}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {routine.weekdays.length === 7
            ? "Каждый день"
            : MONDAY_FIRST.filter((d) => routine.weekdays.includes(d))
                .map((d) => SHORT_DAYS[d])
                .join(" · ")}
        </p>
      </div>
      <button
        onClick={() => onToggle(routine)}
        className={`relative h-6 w-11 rounded-full transition-colors ${routine.active ? "bg-foreground" : "bg-secondary"}`}
        aria-label={routine.active ? "Выключить" : "Включить"}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-background transition-transform ${routine.active ? "translate-x-5" : "translate-x-1"}`}
        />
      </button>
      <Button variant="ghost" size="icon-sm" onClick={() => onEdit(routine)}>
        <Pencil />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => onDelete(routine)}>
        <Trash2 />
      </Button>
    </li>
  );
}

function RoutineEditor({
  routine,
  onClose,
  onSaved,
}: {
  routine: PlannerRoutine | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(routine?.title ?? "");
  const [time, setTime] = useState(routine?.time_of_day?.slice(0, 5) ?? "");
  const [days, setDays] = useState(routine?.weekdays ?? [1, 2, 3, 4, 5]);
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (routine) {
        await updateRoutineFuture(routine.id, localIso(), {
          title: title.trim(),
          time_of_day: time || null,
          weekdays: days,
        });
      } else {
        await createRoutine({
          title: title.trim(),
          time: time || null,
          weekdays: days,
          startsOn: localIso(),
        });
      }
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={save}>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-serif text-2xl">{routine ? "Изменить рутину" : "Новая рутина"}</h3>
        <Button type="button" variant="ghost" size="icon" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название"
          className="h-12 w-full rounded-md border border-input bg-card px-3 text-base"
        />
        <label className="block text-xs text-muted-foreground">
          Время
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 h-12 w-full rounded-md border border-input bg-card px-3 text-base text-foreground"
          />
        </label>
        <DayPicker value={days} onChange={setDays} />
      </div>
      <Button
        className="mt-5 h-12 w-full rounded-full"
        disabled={saving || !title.trim() || !days.length}
      >
        {saving ? "Сохраняю…" : "Сохранить"}
      </Button>
    </form>
  );
}
