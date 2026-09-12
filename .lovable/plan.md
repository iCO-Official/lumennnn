# Lumen — mobile-first redesign and planning architecture

## Goal
Turn the existing Lumen into an iPhone-first daily system without replacing the project or losing journal, sleep, health, workout, gaming, metrics, profile, or AI data.

The primary flow becomes: open Lumen → see today → understand the next action → complete it.

## 1. Preserve data and strengthen the planner model

- Keep all existing tables and records; do not delete legacy features or `routine_logs`.
- Extend `tasks` with an optional scheduled time and stable display order.
- Extend `routines` from a single weekday to selected weekdays while migrating existing `day_of_week` values into the new format.
- Add recurrence start/end metadata so future changes never rewrite historical days.
- Add a uniqueness rule for one generated task instance per routine and date.
- Implement one shared routine-instance generator for today/week/month views and reminders, instead of generating only when the Plans tab opens.
- Existing routine-derived tasks remain historical snapshots. Editing “Only today” changes that task instance; “All future” updates the routine and only future generated instances.

## 2. Rebuild the authenticated shell mobile-first

- Refactor the oversized `/app` file into focused planner, routine, journal, sleep, AI, and shared navigation components while keeping `/app` and current data access intact.
- Use a full-screen edge-to-edge mobile shell with safe-area top/bottom spacing, no outer device frame, no page-wide border, and no decorative grid/glow.
- Keep desktop usable with a restrained centered content width, but make iPhone the authoritative layout.
- Reduce bottom navigation to four destinations: **Сегодня**, **Планы**, **Дневник**, **AI**.
- Put routine editing inside Plans and sleep inside Journal, preserving both features.
- Keep settings and theme controls compact, reachable, and compatible with the existing logo.

## 3. Make Today the main screen

- Replace the AI mood-card dashboard with date, live completion progress, chronological timeline, untimed tasks, and the next unfinished task.
- Merge one-off tasks and generated routine instances into the same timeline.
- Sort timed items by time, then explicit order; show untimed items in a separate “Без времени” section.
- Update `done / total` and percentage optimistically as checkboxes change.
- Add a compact quick-add sheet: title → date → time → repeat → save.
- Editing or deleting a routine-derived task opens the required scope choice: **Только сегодня** or **Все будущие**.

## 4. Plans and routine editor

- **Сегодня:** the same focused timeline experience.
- **Неделя:** seven compact day summaries with completion and upcoming items.
- **Месяц:** compact calendar with task counts and selected-day details.
- Routine editor includes title, time, multiple weekdays, order, edit, delete, enable/disable, and drag-and-drop sorting.
- Use a proven sortable interaction library, with accessible button controls as a fallback.
- Keep one-off tasks tied to one concrete date; routines create independent daily task instances.

## 5. Journal and sleep

- Keep all existing journal and sleep CRUD/history/chart behavior.
- Present Journal and Sleep as two quiet subviews inside the **Дневник** destination.
- Restyle them with open sections, thin dividers, restrained controls, and fewer nested cards.
- Preserve other existing data features in Settings/secondary screens so no stored functionality is lost.

## 6. AI planning proposals

- Change AI planning tools from immediate database writes to structured proposals.
- AI can propose creating a task, creating/updating a routine, building a schedule, or moving unfinished work.
- Show each proposal in chat with **Подтвердить** and **Отменить**; only confirmation writes data.
- Keep friendly conversation and analysis context across journal, sleep, tasks, routines, health, workouts, gaming, and custom metrics.
- Remove destructive “delete then replace” schedule behavior.

## 7. Premium visual system

- Use the supplied Lumen screens as the visual reference, not as an embedded image.
- Dark app: near-black background, warm white primary text, neutral gray secondary text, one restrained accent, thin separators, minimal shadows.
- Instrument Serif for expressive headings and modern sans-serif for controls/body.
- Use rounded surfaces only for controls, sheets, and intentionally grouped content; avoid card-on-card layouts.
- Keep the existing Lumen ring-and-dot logo unchanged.
- Ensure all text inputs render at least 16px on iPhone to prevent Safari zoom.
- Respect reduced-motion and use only short functional transitions.

## 8. Light premium landing page

- Recompose the first viewport as an asymmetric product layout: copy and calls-to-action on the left, a large off-center iPhone showing the real Today timeline on the right.
- Keep the phone visibly right-aligned rather than centered.
- Replace the dark grid, generic feature-card wall, and dashboard mockup with spacious editorial sections and a smaller set of concrete product benefits.
- Keep existing sign-in/registration destinations and the Lumen logo.

## 9. iPhone PWA and independent source

- Keep `display: standalone`, `viewport-fit=cover`, safe areas, existing Lumen icons, app title, and `/app` start URL.
- Preserve the notification service worker; do not add offline app-shell caching because offline use was not requested.
- Guard service-worker registration from local development and Lovable preview while keeping published iPhone notifications functional.
- Remove platform-only error-reporting hooks and isolate managed OAuth/AI behind adapters with clear environment configuration.
- Add an environment example and standard local-run instructions so the GitHub source opens and runs in VS Code without the Lovable editor; current cloud data and auth remain supported.

## 10. Verification

- Apply the database migration first, with grants/RLS preserved, then update generated app types through the supported integration flow.
- Verify existing users and historical records still load.
- Test Today completion, progress, quick add, week/month views, routine generation, drag sorting, active toggle, and both edit scopes.
- Test AI proposal confirmation and cancellation without unintended writes.
- Test landing, auth, settings, Journal/Sleep, and the four-tab shell at iPhone and desktop sizes.
- Verify Add to Home Screen metadata, safe areas, icons, standalone launch, no input zoom, and no overlapping bottom navigation.
- Confirm every content route has complete route-specific metadata.
