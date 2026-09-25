-- Lumen: full database setup for a fresh Supabase project.
-- Generated from supabase/migrations (in order). Paste into SQL Editor and Run.

-- ===== 20260607220944_bad18c37-b223-426e-9174-229239a347d9.sql =====

-- profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  theme TEXT NOT NULL DEFAULT 'dark',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- updated_at helper
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- tasks
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  scope TEXT NOT NULL DEFAULT 'day', -- day | week | month
  scheduled_for DATE NOT NULL DEFAULT CURRENT_DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_user_date_idx ON public.tasks(user_id, scheduled_for);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tasks all" ON public.tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ===== 20260607221043_7278407c-cc62-4e6f-ac0c-e4002fde790a.sql =====

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;

-- ===== 20260607222200_70cb34cc-75e4-4dad-9cc2-478a07b29974.sql =====

-- Extend profiles with age, gender, name
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age int,
  ADD COLUMN IF NOT EXISTS gender text;

-- Update signup trigger to capture name/age/gender from raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, age, gender)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NULLIF(NEW.raw_user_meta_data->>'age','')::int,
    NULLIF(NEW.raw_user_meta_data->>'gender','')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Journal entries
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  content text NOT NULL,
  mood int,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own journal all" ON public.journal_entries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER journal_updated_at BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Sleep logs
CREATE TABLE IF NOT EXISTS public.sleep_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  hours numeric(4,2) NOT NULL,
  quality int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, log_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sleep_logs TO authenticated;
GRANT ALL ON public.sleep_logs TO service_role;
ALTER TABLE public.sleep_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sleep all" ON public.sleep_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER sleep_updated_at BEFORE UPDATE ON public.sleep_logs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Workouts
CREATE TABLE IF NOT EXISTS public.workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  kind text,
  duration_min int,
  intensity int,
  workout_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workouts TO authenticated;
GRANT ALL ON public.workouts TO service_role;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own workouts all" ON public.workouts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER workouts_updated_at BEFORE UPDATE ON public.workouts FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Health logs (mood, energy, water, weight)
CREATE TABLE IF NOT EXISTS public.health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  mood int,
  energy int,
  water_ml int,
  weight_kg numeric(5,2),
  steps int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, log_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_logs TO authenticated;
GRANT ALL ON public.health_logs TO service_role;
ALTER TABLE public.health_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own health all" ON public.health_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER health_updated_at BEFORE UPDATE ON public.health_logs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- AI chat messages (friend-style assistant)
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai_messages all" ON public.ai_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== 20260609122852_1bab3934-57ed-4e04-9686-438cfeb5af3e.sql =====

CREATE TABLE public.routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  day_of_week smallint, -- 0=Sun..6=Sat, null = every day
  time_of_day text, -- "08:30" optional
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.routines TO authenticated;
GRANT ALL ON public.routines TO service_role;

ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own routines all" ON public.routines
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_routines_updated_at BEFORE UPDATE ON public.routines
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX routines_user_day_idx ON public.routines(user_id, day_of_week);

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS routine_id uuid REFERENCES public.routines(id) ON DELETE SET NULL;

-- ===== 20260909163526_6dd3d04d-dd2d-43a3-bcf4-f9c12c406760.sql =====
CREATE TABLE public.routine_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid not null references public.routines(id) on delete cascade,
  log_date date not null default (now() at time zone 'utc')::date,
  done boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (routine_id, log_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routine_logs TO authenticated;
GRANT ALL ON public.routine_logs TO service_role;
ALTER TABLE public.routine_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own routine logs" ON public.routine_logs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER update_routine_logs_updated_at BEFORE UPDATE ON public.routine_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- ===== 20260913061106_ad2414bc-3ff4-4206-82df-e446ddf5efd8.sql =====
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
-- ===== 20260925100000_restore_missing_schema.sql =====
-- Tables/columns that existed in the Lovable Cloud database but were never
-- captured in migrations. Idempotent, so it is a no-op on that database.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS interests text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS steam_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS faceit_nickname text;

ALTER TABLE public.sleep_logs ADD COLUMN IF NOT EXISTS bedtime text;
ALTER TABLE public.sleep_logs ADD COLUMN IF NOT EXISTS wake_time text;

CREATE TABLE IF NOT EXISTS public.custom_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'number' CHECK (kind IN ('number', 'text')),
  unit text,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_metrics TO authenticated;
GRANT ALL ON public.custom_metrics TO service_role;
ALTER TABLE public.custom_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own custom_metrics all" ON public.custom_metrics;
CREATE POLICY "own custom_metrics all" ON public.custom_metrics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS custom_metrics_updated_at ON public.custom_metrics;
CREATE TRIGGER custom_metrics_updated_at BEFORE UPDATE ON public.custom_metrics FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.custom_metric_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.custom_metrics(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  value_num numeric,
  value_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS custom_metric_logs_metric_date_idx ON public.custom_metric_logs (metric_id, log_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_metric_logs TO authenticated;
GRANT ALL ON public.custom_metric_logs TO service_role;
ALTER TABLE public.custom_metric_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own custom_metric_logs all" ON public.custom_metric_logs;
CREATE POLICY "own custom_metric_logs all" ON public.custom_metric_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.gaming_stats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  steam_total_minutes integer,
  steam_top_games jsonb,
  faceit_level integer,
  faceit_elo integer,
  faceit_kd numeric,
  faceit_winrate numeric,
  faceit_recent jsonb,
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gaming_stats TO authenticated;
GRANT ALL ON public.gaming_stats TO service_role;
ALTER TABLE public.gaming_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own gaming_stats all" ON public.gaming_stats;
CREATE POLICY "own gaming_stats all" ON public.gaming_stats FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== 20260925120000_chat_images.sql =====
-- Photos in AI chat: private storage bucket + link from ai_messages.

ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS image_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-images', 'chat-images', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Each user can only touch files inside their own folder: <user_id>/<file>.
DROP POLICY IF EXISTS "chat-images own select" ON storage.objects;
DROP POLICY IF EXISTS "chat-images own insert" ON storage.objects;
DROP POLICY IF EXISTS "chat-images own delete" ON storage.objects;

CREATE POLICY "chat-images own select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "chat-images own insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "chat-images own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ===== 20260926090000_routine_occurrences.sql =====
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
