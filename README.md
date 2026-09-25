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

## Структура

- `src/routes/_authenticated/app.index.tsx` — главный экран (`/app`): нижняя навигация и разделы.
- `src/routes/_authenticated/app.more.tsx` — «Ещё» (`/app/more`): тренировки, здоровье, метрики, игры, статистика.
- `src/components/app/*` — разделы приложения, по файлу на тему; `shared.tsx` — общие мелкие компоненты.
- `src/components/planner-sections.tsx`, `src/lib/planner.ts` — задачи и рутины.
- `src/lib/ai.functions.ts` — серверные функции AI.

## Проверки

```bash
npm run typecheck && npm run lint && npm run build
```

Их же запускает GitHub Actions (`.github/workflows/ci.yml`) на каждый pull request и push в `main`.

## Переменные окружения

См. `.env.example`.

- `VITE_SUPABASE_*` — URL и публичный ключ Supabase. Без них используется проект, прописанный в `vite.config.ts`.
- `AI_API_KEY` — ключ Google Gemini (бесплатно: https://aistudio.google.com/apikey).
  `AI_MODEL` (по умолчанию `gemini-flash-latest`) и `AI_API_URL` позволяют взять другую модель
  или любой OpenAI-совместимый API.
  Если модель перегружена (503/429), запрос повторяется, затем уходит на запасную
  (`AI_FALLBACK_MODELS`, по умолчанию `gemini-flash-lite-latest`).

## Вход через Google / Apple

Вход идёт через `supabase.auth.signInWithOAuth`. Включи провайдеров в Supabase
(Authentication → Providers) и добавь адрес сайта в Authentication → URL Configuration → Redirect URLs.
Вход по email и паролю работает без дополнительной настройки.

## Фото в AI-чате

Фото сжимаются на телефоне и хранятся в приватном бакете Supabase Storage `chat-images`
(у каждого пользователя своя папка). Бакет и доступы создаёт миграция
`supabase/migrations/20260925120000_chat_images.sql`. Пока она не применена, чат работает, но без фото.

## Напоминания (push)

Напоминания приходят, даже когда приложение закрыто (на iPhone — если Lumen открыт с экрана «Домой», iOS 16.4+).

- Раз в минуту Supabase (`pg_cron` + `pg_net`) делает POST на `/api/push-tick` с секретом из таблицы `push_config`.
- Функция `push_due` в базе решает, что пора отправить: в момент дела, через час если не сделано, и сводка в 9, 13, 18 и 21 час (по часовому поясу устройства). Она же создаёт дела из рутин на сегодня.
- `/api/push-tick` подписывает и отправляет уведомления (`web-push`). VAPID-ключи создаются автоматически при первом запуске и хранятся в `push_config`.
- Включить на устройстве: Настройки → Напоминания → Включить; «Проверить» присылает тестовое уведомление в течение минуты.

Переменные окружения для этого не нужны. Настройка базы — `supabase/updates/2026-09-26.sql` (адрес сайта задаётся в нём же).

## База данных

Миграции лежат в `supabase/migrations`. Для своего проекта Supabase:

```bash
npx supabase link --project-ref <id>
npx supabase db push
```
