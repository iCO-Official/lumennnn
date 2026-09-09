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