import { supabase } from "@/integrations/supabase/client";

export type PlannerTask = {
  id: string;
  title: string;
  notes: string | null;
  scheduled_for: string;
  scheduled_time: string | null;
  completed: boolean;
  completed_at: string | null;
  routine_id: string | null;
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
};

export function localIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromIso(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(iso: string, amount: number) {
  const date = dateFromIso(iso);
  date.setDate(date.getDate() + amount);
  return localIso(date);
}

export async function ensureRoutineInstances(from: string, to: string) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return;

  const { data: routines, error } = await supabase
    .from("routines")
    .select("id,title,time_of_day,weekdays,starts_on,ends_on,sort_order,active")
    .eq("user_id", user.id)
    .eq("active", true)
    .lte("starts_on", to)
    .or(`ends_on.is.null,ends_on.gte.${from}`);
  if (error) throw error;

  const rows: Array<{
    user_id: string;
    title: string;
    scheduled_for: string;
    scheduled_time: string | null;
    routine_id: string;
    sort_order: number;
    scope: string;
  }> = [];

  for (const routine of routines ?? []) {
    const start = routine.starts_on > from ? routine.starts_on : from;
    const end = routine.ends_on && routine.ends_on < to ? routine.ends_on : to;
    for (let iso = start; iso <= end; iso = addDays(iso, 1)) {
      if (!(routine.weekdays ?? []).includes(dateFromIso(iso).getDay())) continue;
      rows.push({
        user_id: user.id,
        title: routine.title,
        scheduled_for: iso,
        scheduled_time: routine.time_of_day,
        routine_id: routine.id,
        sort_order: routine.sort_order,
        scope: "day",
      });
    }
  }

  if (rows.length) {
    const { error: insertError } = await supabase
      .from("tasks")
      .upsert(rows, { onConflict: "routine_id,scheduled_for", ignoreDuplicates: true });
    if (insertError) throw insertError;
  }
}

export async function loadTasks(from: string, to = from) {
  await ensureRoutineInstances(from, to);
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id,title,notes,scheduled_for,scheduled_time,completed,completed_at,routine_id,sort_order,scope",
    )
    .gte("scheduled_for", from)
    .lte("scheduled_for", to)
    .order("scheduled_for")
    .order("scheduled_time", { nullsFirst: false })
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as PlannerTask[];
}

export async function createTask(draft: TaskDraft) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Войди в аккаунт");

  if (draft.repeatDays.length) {
    const { data, error } = await supabase
      .from("routines")
      .insert({
        user_id: user.id,
        title: draft.title,
        time_of_day: draft.time,
        weekdays: draft.repeatDays,
        starts_on: draft.date,
        day_of_week: draft.repeatDays.length === 1 ? draft.repeatDays[0] : null,
        sort_order: 999,
      })
      .select("id,title,time_of_day,weekdays,starts_on,ends_on,sort_order,active")
      .single();
    if (error) throw error;
    await ensureRoutineInstances(draft.date, draft.date);
    return { kind: "routine" as const, data };
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title: draft.title,
      scheduled_for: draft.date,
      scheduled_time: draft.time,
      scope: "day",
    })
    .select(
      "id,title,notes,scheduled_for,scheduled_time,completed,completed_at,routine_id,sort_order,scope",
    )
    .single();
  if (error) throw error;
  return { kind: "task" as const, data };
}

export async function loadRoutines() {
  const { data, error } = await supabase
    .from("routines")
    .select("id,title,time_of_day,weekdays,starts_on,ends_on,sort_order,active")
    .order("sort_order")
    .order("time_of_day", { nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as PlannerRoutine[];
}

export async function updateTaskInstance(
  id: string,
  values: Partial<Pick<PlannerTask, "title" | "scheduled_for" | "scheduled_time" | "sort_order">>,
) {
  const { error } = await supabase.from("tasks").update(values).eq("id", id);
  if (error) throw error;
}

export async function updateRoutineFuture(
  routineId: string,
  fromDate: string,
  values: Partial<
    Pick<PlannerRoutine, "title" | "time_of_day" | "weekdays" | "active" | "sort_order">
  >,
) {
  const { error } = await supabase.from("routines").update(values).eq("id", routineId);
  if (error) throw error;
  const update: Partial<Pick<PlannerTask, "title" | "scheduled_time" | "sort_order">> = {};
  if (values.title !== undefined) update.title = values.title;
  if (values.time_of_day !== undefined) update.scheduled_time = values.time_of_day;
  if (values.sort_order !== undefined) update.sort_order = values.sort_order;
  if (Object.keys(update).length) {
    const { error: taskError } = await supabase
      .from("tasks")
      .update(update)
      .eq("routine_id", routineId)
      .gte("scheduled_for", fromDate);
    if (taskError) throw taskError;
  }
}

export async function removeTask(task: PlannerTask, allFuture: boolean) {
  if (allFuture && task.routine_id) {
    const yesterday = addDays(task.scheduled_for, -1);
    const { error: routineError } = await supabase
      .from("routines")
      .update({ ends_on: yesterday, active: false })
      .eq("id", task.routine_id);
    if (routineError) throw routineError;
    const { error: futureError } = await supabase
      .from("tasks")
      .delete()
      .eq("routine_id", task.routine_id)
      .gte("scheduled_for", task.scheduled_for);
    if (futureError) throw futureError;
    return;
  }
  const { error } = await supabase.from("tasks").delete().eq("id", task.id);
  if (error) throw error;
}
