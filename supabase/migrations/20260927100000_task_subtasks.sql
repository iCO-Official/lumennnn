-- Optional checklist inside a task: [{ "id": "...", "title": "Русский", "done": false }, ...]
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS subtasks jsonb NOT NULL DEFAULT '[]'::jsonb;
