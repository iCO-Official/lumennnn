-- Routine instances: remember which routine occurrence a task row represents,
-- so moving, skipping or editing a single day never makes the generator
-- recreate it.
--   occurrence_date — the day the routine produced this instance (scheduled_for may differ after a move)
--   detached        — edited individually; series edits leave it alone
--   skipped         — "only this day" deletion; kept as a marker so it isn't regenerated

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS occurrence_date date;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS detached boolean NOT NULL DEFAULT false;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS skipped boolean NOT NULL DEFAULT false;

UPDATE public.tasks SET occurrence_date = scheduled_for
WHERE routine_id IS NOT NULL AND occurrence_date IS NULL;

-- A plain (non-partial) unique index so upserts can target it with ON CONFLICT.
-- NULLs are distinct, so one-off tasks (routine_id NULL) never collide.
DROP INDEX IF EXISTS public.tasks_routine_date_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_routine_occurrence_key
  ON public.tasks (routine_id, occurrence_date);

-- Unused legacy table (replaced by routine instances in tasks).
DROP TABLE IF EXISTS public.routine_logs;
