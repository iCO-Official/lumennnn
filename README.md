# Lumen

Личный ежедневник: задачи, рутины, дневник, сон, здоровье и AI-друг.
Стек: TanStack Start (React 19, Vite), Tailwind CSS 4, Supabase.

## Локальный запуск

```bash
npm install
cp .env.example .env   # заполни AI_API_KEY (и свой Supabase, если нужен)
npm run dev            # http://localhost:8080
```

## Сборка и запуск

```bash
npm run build
npm start              # Node-сервер из .output/
```

Сборку делает [Nitro](https://nitro.build): на Vercel, Netlify или Cloudflare платформа
определяется автоматически. Для явного выбора задай `NITRO_PRESET`
(например `NITRO_PRESET=cloudflare-module`).

## Переменные окружения

См. `.env.example`.

- `VITE_SUPABASE_*` — URL и публичный ключ Supabase. Без них используется проект, прописанный в `vite.config.ts`.
- `AI_API_KEY` — ключ Google Gemini (бесплатно: https://aistudio.google.com/apikey).
  `AI_MODEL` (по умолчанию `gemini-flash-latest`) и `AI_API_URL` позволяют взять другую модель
  или любой OpenAI-совместимый API.

## Вход через Google / Apple

Вход идёт через `supabase.auth.signInWithOAuth`. Включи провайдеров в Supabase
(Authentication → Providers) и добавь адрес сайта в Authentication → URL Configuration → Redirect URLs.
Вход по email и паролю работает без дополнительной настройки.

## Фото в AI-чате

Фото сжимаются на телефоне и хранятся в приватном бакете Supabase Storage `chat-images`
(у каждого пользователя своя папка). Бакет и доступы создаёт миграция
`supabase/migrations/20260925120000_chat_images.sql`. Пока она не применена, чат работает, но без фото.

## База данных

Миграции лежат в `supabase/migrations`. Для своего проекта Supabase:

```bash
npx supabase link --project-ref <id>
npx supabase db push
```
