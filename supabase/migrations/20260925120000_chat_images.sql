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
