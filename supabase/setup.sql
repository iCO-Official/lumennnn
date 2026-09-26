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

-- ===== 20260926100000_push_notifications.sql =====
-- Web Push reminders.
--
-- A pg_cron job (see supabase/updates/*.sql) POSTs to <site>/api/push-tick every
-- minute with the cron secret. The endpoint calls push_due(secret), which
-- works out what each subscribed device should be told right now, and sends it.
-- Keys and the secret live in push_config, which is not exposed through the API.

CREATE TABLE IF NOT EXISTS public.push_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cron_secret text NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  site_url text,
  vapid_public text,
  vapid_private text
);
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY; -- no policies: API can't read it
INSERT INTO public.push_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  test_requested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "own push_subscriptions" ON public.push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- What was already sent to which device, so every reminder goes out once.
CREATE TABLE IF NOT EXISTS public.push_log (
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, key)
);
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY; -- no policies

-- Public VAPID key for subscribing in the browser.
CREATE OR REPLACE FUNCTION public.push_public_key()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT vapid_public FROM push_config WHERE id = 1;
$$;
GRANT EXECUTE ON FUNCTION public.push_public_key() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.push_check_secret(p_secret text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_secret IS NULL OR p_secret <> (SELECT cron_secret FROM push_config WHERE id = 1) THEN
    RAISE EXCEPTION 'invalid push secret' USING ERRCODE = '28000';
  END IF;
END; $$;

-- VAPID key pair for the sender (generated by the endpoint on first run).
CREATE OR REPLACE FUNCTION public.push_keys(p_secret text)
RETURNS TABLE (vapid_public text, vapid_private text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM push_check_secret(p_secret);
  RETURN QUERY SELECT c.vapid_public, c.vapid_private FROM push_config c WHERE c.id = 1;
END; $$;

CREATE OR REPLACE FUNCTION public.push_set_keys(p_secret text, p_public text, p_private text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM push_check_secret(p_secret);
  UPDATE push_config SET vapid_public = p_public, vapid_private = p_private
  WHERE id = 1 AND vapid_public IS NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.push_remove_subscription(p_secret text, p_endpoint text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM push_check_secret(p_secret);
  DELETE FROM push_subscriptions WHERE endpoint = p_endpoint;
END; $$;

-- Reminders due right now, one row per (device, notification). Marks them as sent.
--   * at the task's time (within 10 minutes)
--   * once more if it's still not done an hour later
--   * a summary of what's left at 09:00, 13:00, 18:00 and 21:00
-- Also creates today's routine instances, so routines remind even if the app
-- wasn't opened today. Times are evaluated in each device's timezone.
CREATE OR REPLACE FUNCTION public.push_due(p_secret text)
RETURNS TABLE (endpoint text, p256dh text, auth text, title text, body text, tag text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  t record;
  local_now timestamp;
  today date;
  now_min integer;
  start_min integer;
  pending_count integer;
  pending_titles text;
BEGIN
  PERFORM push_check_secret(p_secret);
  DELETE FROM push_log WHERE sent_at < now() - interval '3 days';

  FOR s IN SELECT * FROM push_subscriptions LOOP
    local_now := now() AT TIME ZONE coalesce(nullif(s.timezone, ''), 'UTC');
    today := local_now::date;
    now_min := extract(hour FROM local_now)::int * 60 + extract(minute FROM local_now)::int;

    INSERT INTO tasks (user_id, title, scheduled_for, occurrence_date, scheduled_time, routine_id, sort_order, scope)
    SELECT r.user_id, r.title, today, today,
           CASE WHEN r.time_of_day ~ '^\d{1,2}:\d{2}(:\d{2})?$' THEN r.time_of_day::time END,
           r.id, r.sort_order, 'day'
    FROM routines r
    WHERE r.user_id = s.user_id AND r.active
      AND r.starts_on <= today AND (r.ends_on IS NULL OR r.ends_on >= today)
      AND extract(dow FROM today)::smallint = ANY (r.weekdays)
    ON CONFLICT (routine_id, occurrence_date) DO NOTHING;

    IF s.test_requested THEN
      UPDATE push_subscriptions SET test_requested = false WHERE id = s.id;
      endpoint := s.endpoint; p256dh := s.p256dh; auth := s.auth;
      title := 'Lumen'; body := 'Уведомления работают 🎉'; tag := 'lumen-test';
      RETURN NEXT;
    END IF;

    FOR t IN
      SELECT tk.id, tk.title, tk.scheduled_time FROM tasks tk
      WHERE tk.user_id = s.user_id AND tk.scheduled_for = today
        AND NOT tk.completed AND NOT tk.skipped AND tk.scheduled_time IS NOT NULL
    LOOP
      start_min := extract(hour FROM t.scheduled_time)::int * 60 + extract(minute FROM t.scheduled_time)::int;
      IF now_min BETWEEN start_min AND start_min + 10 THEN
        INSERT INTO push_log (subscription_id, key) VALUES (s.id, 'task:' || t.id || ':' || today)
        ON CONFLICT DO NOTHING;
        IF FOUND THEN
          endpoint := s.endpoint; p256dh := s.p256dh; auth := s.auth;
          title := 'Lumen · пора'; body := to_char(t.scheduled_time, 'HH24:MI') || ' · ' || t.title;
          tag := 'lumen-task-' || t.id;
          RETURN NEXT;
        END IF;
      ELSIF now_min >= start_min + 60 THEN
        INSERT INTO push_log (subscription_id, key) VALUES (s.id, 'late:' || t.id || ':' || today)
        ON CONFLICT DO NOTHING;
        IF FOUND THEN
          endpoint := s.endpoint; p256dh := s.p256dh; auth := s.auth;
          title := 'Lumen · ещё не сделано';
          body := t.title || ' — было на ' || to_char(t.scheduled_time, 'HH24:MI');
          tag := 'lumen-late-' || t.id;
          RETURN NEXT;
        END IF;
      END IF;
    END LOOP;

    IF extract(hour FROM local_now)::int IN (9, 13, 18, 21) THEN
      SELECT count(*) INTO pending_count FROM tasks tk
      WHERE tk.user_id = s.user_id AND tk.scheduled_for = today AND NOT tk.completed AND NOT tk.skipped;
      IF pending_count > 0 THEN
        INSERT INTO push_log (subscription_id, key)
        VALUES (s.id, 'summary:' || today || ':' || extract(hour FROM local_now)::int)
        ON CONFLICT DO NOTHING;
        IF FOUND THEN
          SELECT string_agg(y.title, ', ') INTO pending_titles FROM (
            SELECT tk.title FROM tasks tk
            WHERE tk.user_id = s.user_id AND tk.scheduled_for = today AND NOT tk.completed AND NOT tk.skipped
            ORDER BY tk.scheduled_time NULLS LAST, tk.sort_order LIMIT 3
          ) y;
          endpoint := s.endpoint; p256dh := s.p256dh; auth := s.auth;
          title := 'Lumen · осталось ' || pending_count;
          body := pending_titles || CASE WHEN pending_count > 3 THEN ' и ещё ' || (pending_count - 3) ELSE '' END;
          tag := 'lumen-summary';
          RETURN NEXT;
        END IF;
      END IF;
    END IF;
  END LOOP;
END; $$;

-- Only the endpoint (holding the secret) may call these; the secret is checked inside.
REVOKE ALL ON FUNCTION public.push_check_secret(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.push_keys(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_set_keys(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_remove_subscription(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_due(text) TO anon, authenticated;

-- ===== 20260926120000_ai_message_proposals.sql =====
-- Keep AI proposal cards (create task / schedule / move) with the message,
-- so they survive reloads until confirmed or dismissed (then set to NULL).
ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS proposal jsonb;
