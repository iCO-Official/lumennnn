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
