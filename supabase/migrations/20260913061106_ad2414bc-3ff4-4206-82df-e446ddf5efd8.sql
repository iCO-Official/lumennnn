ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS scheduled_time time,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.routines
  ADD COLUMN IF NOT EXISTS weekdays smallint[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::smallint[],
  ADD COLUMN IF NOT EXISTS starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS ends_on date;

UPDATE public.routines
SET weekdays = CASE
  WHEN day_of_week IS NULL THEN ARRAY[0,1,2,3,4,5,6]::smallint[]
  ELSE ARRAY[day_of_week]::smallint[]
END
WHERE weekdays = ARRAY[0,1,2,3,4,5,6]::smallint[];

CREATE INDEX IF NOT EXISTS tasks_user_date_time_idx
  ON public.tasks(user_id, scheduled_for, scheduled_time, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS tasks_routine_date_unique_idx
  ON public.tasks(routine_id, scheduled_for)
  WHERE routine_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS routines_user_active_dates_idx
  ON public.routines(user_id, active, starts_on, ends_on);

CREATE OR REPLACE FUNCTION public.validate_routine_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.weekdays IS NULL OR cardinality(NEW.weekdays) = 0 THEN
    RAISE EXCEPTION 'A routine must repeat on at least one weekday';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.weekdays) AS d WHERE d < 0 OR d > 6) THEN
    RAISE EXCEPTION 'Routine weekdays must be between 0 and 6';
  END IF;
  IF NEW.ends_on IS NOT NULL AND NEW.ends_on < NEW.starts_on THEN
    RAISE EXCEPTION 'Routine end date cannot be before its start date';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_routine_schedule_trigger ON public.routines;
CREATE TRIGGER validate_routine_schedule_trigger
BEFORE INSERT OR UPDATE OF weekdays, starts_on, ends_on ON public.routines
FOR EACH ROW EXECUTE FUNCTION public.validate_routine_schedule();