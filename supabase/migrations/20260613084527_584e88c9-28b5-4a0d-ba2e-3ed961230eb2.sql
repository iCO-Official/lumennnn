-- Profile additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interests text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS steam_id text,
  ADD COLUMN IF NOT EXISTS faceit_nickname text;

-- Custom metrics (user-defined trackers)
CREATE TABLE IF NOT EXISTS public.custom_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text,
  kind text NOT NULL DEFAULT 'number',
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_metrics TO authenticated;
GRANT ALL ON public.custom_metrics TO service_role;
ALTER TABLE public.custom_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own custom_metrics" ON public.custom_metrics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tg_custom_metrics_updated BEFORE UPDATE ON public.custom_metrics FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Daily logs for custom metrics
CREATE TABLE IF NOT EXISTS public.custom_metric_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.custom_metrics(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT (now()::date),
  value_num numeric,
  value_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS custom_metric_logs_user_date_idx ON public.custom_metric_logs(user_id, log_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_metric_logs TO authenticated;
GRANT ALL ON public.custom_metric_logs TO service_role;
ALTER TABLE public.custom_metric_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own custom_metric_logs" ON public.custom_metric_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Gaming stats cache
CREATE TABLE IF NOT EXISTS public.gaming_stats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  steam_total_minutes int,
  steam_top_games jsonb,
  faceit_elo int,
  faceit_level int,
  faceit_kd numeric,
  faceit_winrate numeric,
  faceit_recent jsonb,
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gaming_stats TO authenticated;
GRANT ALL ON public.gaming_stats TO service_role;
ALTER TABLE public.gaming_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gaming_stats" ON public.gaming_stats FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tg_gaming_stats_updated BEFORE UPDATE ON public.gaming_stats FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Extend new-user trigger to accept interests
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, age, gender, interests)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NULLIF(NEW.raw_user_meta_data->>'age','')::int,
    NULLIF(NEW.raw_user_meta_data->>'gender',''),
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(COALESCE((NEW.raw_user_meta_data->'interests')::jsonb, '[]'::jsonb))),
      '{}'::text[]
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $function$;