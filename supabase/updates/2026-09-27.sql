-- Lumen update 2026-09-27: AI proposal cards survive reloads + subtasks in tasks.
-- Run once in Supabase → SQL Editor. Safe to run again.

-- Keep AI proposal cards (create task / schedule / move) with the message,
-- so they survive reloads until confirmed or dismissed (then set to NULL).
ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS proposal jsonb;

-- Optional checklist inside a task: [{ "id": "...", "title": "Русский", "done": false }, ...]
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS subtasks jsonb NOT NULL DEFAULT '[]'::jsonb;
