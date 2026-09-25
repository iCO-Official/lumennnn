import { supabase } from "@/integrations/supabase/client";
import { isoAddDays, routineOccurrences } from "@/lib/routine-schedule";

export type PlannerTask = {
  id: string;
  title: string;
  notes: string | null;
  scheduled_for: string;
  scheduled_time: string | null;
  completed: boolean;
  completed_at: string | null;
  routine_id: string | null;
  occurrence_date: string | null;
  detached: boolean;
  sort_order: number;
  scope: string;
};

export type PlannerRoutine = {
  id: string;
  title: string;
  time_of_day: string | null;
  weekdays: number[];
  starts_on: string;
  ends_on: string | null;
  sort_order: number;
  active: boolean;
};

export type TaskDraft = {
  title: string;
  date: string;
  time: string | null;
  repeatDays: number[];
  sortOrder?: number;
};

type RoutineValues = Partial<
  Pick<PlannerRoutine, "title" | "time_of_day" | "weekdays" | "sort_order">
>;

const TASK_FIELDS =
  "id,title,notes,scheduled_for,scheduled_time,completed,completed_at,routine_id,occurrence_date,detached,sort_order,scope";
const ROUTINE_FIELDS = "id,title,time_of_day,weekdays,starts_on,ends_on,sort_order,active";

/** Fired after any planner write, so kept-alive tabs (Plans, Routines) refresh. */
export const PLANNER_CHANGED = "lumen:planner-changed";
function plannerChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PLANNER_CHANGED));
}

// How far ahead routine instances are created after a routine changes.
const GENERATE_AHEAD_DAYS = 14;

export function localIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const addDays = isoAddDays;

async function requireUser() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Войди в аккаунт");
  return data.user;
}

/**
 * Creates routine instances (task rows) for [from, to]. Past days are never
 * filled in retroactively; existing instances — including moved, edited or
 * skipped ones — are left untouched thanks to the (routine_id, occurrence_date) key.
 */
export async function ensureRoutineInstances(from: string, to: string) {
  const today = localIso();
  const start = from > today ? from : today;
  if (to < start) return;
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return;

  const { data: routines, error } = await supabase
    .from("routines")
    .select(ROUTINE_FIELDS)
    .eq("user_id", user.id)
    .eq("active", true)
    .lte("starts_on", to)
    .or(`ends_on.is.null,ends_on.gte.${start}`);
  if (error) throw error;

  const rows = (routines ?? []).flatMap((routine) =>
    routineOccurrences(routine, start, to).map((iso) => ({
      user_id: user.id,
      title: routine.title,
      scheduled_for: iso,
      occurrence_date: iso,
      scheduled_time: routine.time_of_day,
      routine_id: routine.id,
      sort_order: routine.sort_order,
      scope: "day",
    })),
  );
  if (!rows.length) return;
  const { error: insertError } = await supabase
    .from("tasks")
    .upsert(rows, { onConflict: "routine_id,occurrence_date", ignoreDuplicates: true });
  if (insertError) throw insertError;
}

export async function loadTasks(from: string, to = from) {
  await ensureRoutineInstances(from, to);
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_FIELDS)
    .eq("skipped", false)
    .gte("scheduled_for", from)
    .lte("scheduled_for", to)
    .order("scheduled_for")
    .order("scheduled_time", { nullsFirst: false })
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as PlannerTask[];
}

export async function createRoutine(values: {
  title: string;
  time: string | null;
  weekdays: number[];
  startsOn: string;
  sortOrder?: number;
}) {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("routines")
    .insert({
      user_id: user.id,
      title: values.title,
      time_of_day: values.time,
      weekdays: values.weekdays,
      starts_on: values.startsOn,
      sort_order: values.sortOrder ?? 999,
    })
    .select(ROUTINE_FIELDS)
    .single();
  if (error) throw error;
  await ensureRoutineInstances(values.startsOn, isoAddDays(values.startsOn, GENERATE_AHEAD_DAYS));
  plannerChanged();
  return data as PlannerRoutine;
}

export async function createTask(draft: TaskDraft) {
  if (draft.repeatDays.length) {
    const data = await createRoutine({
      title: draft.title,
      time: draft.time,
      weekdays: draft.repeatDays,
      startsOn: draft.date,
      sortOrder: draft.sortOrder,
    });
    return { kind: "routine" as const, data };
  }

  const user = await requireUser();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title: draft.title,
      scheduled_for: draft.date,
      scheduled_time: draft.time,
      sort_order: draft.sortOrder ?? 0,
      scope: "day",
    })
    .select(TASK_FIELDS)
    .single();
  if (error) throw error;
  plannerChanged();
  return { kind: "task" as const, data: data as PlannerTask };
}

/** Routines that still run today or later (ended ones are history). */
export async function loadRoutines() {
  const { data, error } = await supabase
    .from("routines")
    .select(ROUTINE_FIELDS)
    .or(`ends_on.is.null,ends_on.gte.${localIso()}`)
    .order("sort_order")
    .order("time_of_day", { nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as PlannerRoutine[];
}

/** Edits one day only. A routine instance becomes detached from series edits. */
export async function updateTaskInstance(
  task: Pick<PlannerTask, "id" | "routine_id">,
  values: Partial<Pick<PlannerTask, "title" | "scheduled_for" | "scheduled_time" | "sort_order">>,
) {
  const { error } = await supabase
    .from("tasks")
    .update(task.routine_id ? { ...values, detached: true } : values)
    .eq("id", task.id);
  if (error) throw error;
  plannerChanged();
}

/**
 * Removes future instances from `fromDate` on that the user hasn't touched
 * (not done, not edited, not skipped), so they can be regenerated from the rule.
 */
async function clearUntouchedInstances(routineId: string, fromDate: string) {
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("routine_id", routineId)
    .gte("occurrence_date", fromDate)
    .eq("completed", false)
    .eq("detached", false)
    .eq("skipped", false);
  if (error) throw error;
}

/** "This and following": changes the rule and rebuilds untouched instances from `fromDate`. */
export async function updateRoutineFuture(
  routineId: string,
  fromDate: string,
  values: RoutineValues,
) {
  const { error } = await supabase.from("routines").update(values).eq("id", routineId);
  if (error) throw error;
  const from = fromDate > localIso() ? fromDate : localIso();
  await clearUntouchedInstances(routineId, from);
  await ensureRoutineInstances(from, isoAddDays(from, GENERATE_AHEAD_DAYS));
  plannerChanged();
}

export async function setRoutineActive(routineId: string, active: boolean) {
  const { error } = await supabase.from("routines").update({ active }).eq("id", routineId);
  if (error) throw error;
  const today = localIso();
  if (active) await ensureRoutineInstances(today, isoAddDays(today, GENERATE_AHEAD_DAYS));
  else await clearUntouchedInstances(routineId, today);
  plannerChanged();
}

/**
 * Ends a routine: no occurrences from `fromDate` on. Unfinished future
 * instances are removed; completed ones stay as history.
 */
export async function endRoutine(
  routine: Pick<PlannerRoutine, "id" | "starts_on">,
  fromDate: string,
) {
  const { error: tasksError } = await supabase
    .from("tasks")
    .delete()
    .eq("routine_id", routine.id)
    .gte("occurrence_date", fromDate)
    .eq("completed", false);
  if (tasksError) throw tasksError;

  // Ending before the first day would violate ends_on >= starts_on: nothing remains, so delete it.
  const { error } =
    fromDate <= routine.starts_on
      ? await supabase.from("routines").delete().eq("id", routine.id)
      : await supabase
          .from("routines")
          .update({ ends_on: isoAddDays(fromDate, -1) })
          .eq("id", routine.id);
  if (error) throw error;
  plannerChanged();
}

export async function removeTask(task: PlannerTask, allFuture: boolean) {
  if (task.routine_id) {
    if (allFuture) {
      const { data: routine, error } = await supabase
        .from("routines")
        .select("id,starts_on")
        .eq("id", task.routine_id)
        .single();
      if (error) throw error;
      await endRoutine(routine, task.occurrence_date ?? task.scheduled_for);
      return;
    }
    // Keep the row as a "skipped" marker so the generator doesn't bring the day back.
    const { error } = await supabase.from("tasks").update({ skipped: true }).eq("id", task.id);
    if (error) throw error;
    plannerChanged();
    return;
  }
  const { error } = await supabase.from("tasks").delete().eq("id", task.id);
  if (error) throw error;
  plannerChanged();
}
