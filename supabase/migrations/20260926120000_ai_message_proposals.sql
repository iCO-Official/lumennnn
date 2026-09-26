-- Keep AI proposal cards (create task / schedule / move) with the message,
-- so they survive reloads until confirmed or dismissed (then set to NULL).
ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS proposal jsonb;
