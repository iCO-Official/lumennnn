
ALTER TABLE public.sleep_logs
  ADD COLUMN IF NOT EXISTS bedtime timestamptz,
  ADD COLUMN IF NOT EXISTS wake_time timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sleep_logs_user_date_uniq') THEN
    ALTER TABLE public.sleep_logs ADD CONSTRAINT sleep_logs_user_date_uniq UNIQUE (user_id, log_date);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'health_logs_user_date_uniq') THEN
    ALTER TABLE public.health_logs ADD CONSTRAINT health_logs_user_date_uniq UNIQUE (user_id, log_date);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_pct integer NOT NULL DEFAULT 100,
  progress_pct integer NOT NULL DEFAULT 0,
  deadline date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='goals' AND policyname='own goals all') THEN
    CREATE POLICY "own goals all" ON public.goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS goals_set_updated_at ON public.goals;
CREATE TRIGGER goals_set_updated_at BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
