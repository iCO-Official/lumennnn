# Lumen — navigation, planner, routines, and AI chat

## Scope
Keep the current Home content and visual direction unchanged. Preserve all existing records and secondary features. Change only navigation, task/reminder behavior, routine management, AI chat, and settings presentation.

## 1. iPhone navigation
- Keep `/app` and its existing authenticated data flow.
- Use five equal bottom destinations: **Сегодня**, **Планы**, **Рутины**, **Дневник**, **AI**.
- Make the bar fixed, safe-area aware, and reserve matching bottom space so content is never covered.
- Use consistent icon/label sizing and a restrained active state.
- Keep Sleep available as a Journal subview and from Settings rather than as a sixth bottom item.
- Preserve the current Home section exactly; “Сегодня” opens that existing section.

## 2. Tasks and reminders
- Replace the old `scope`-based list behavior with date-based task loading using the existing planner layer.
- Quick add contains only title, date, optional time, and recurrence.
- No recurrence creates one task for one date; recurrence creates a routine and its dated task instances. Never silently convert between them.
- Show timed tasks chronologically and untimed tasks in **Без времени**.
- Add immediate completion, editing, and deletion with optimistic progress updates.
- Keep day/week/month views, with week and month reading the same dated task instances.
- Make reminders read each task instance’s own scheduled time, including routine-generated instances.

## 3. Routine management
- Use the existing migrated fields: time, selected weekdays, order, active state, start/end dates.
- Add a compact routine editor for title, time, and weekdays.
- Add enable/disable, edit, delete, and drag-and-drop ordering using the installed sortable library.
- For a routine instance edit/delete, offer **Только сегодня** or **Все будущие**.
- “Only today” changes only that dated task instance. “All future” updates the routine and future instances; past dates remain untouched.

## 4. Full-screen AI chat
- Replace the framed chat card with an app-height chat layout: compact header, scrolling transcript, and bottom-fixed composer above navigation and iPhone safe areas.
- Use AI Elements conversation, message, markdown response, prompt input, and loading primitives.
- Keep the existing single database-backed conversation and reset/new-chat behavior; no new thread system.
- Maintain textarea focus, long-message wrapping, keyboard-safe viewport sizing, and automatic scroll.

## 5. Confirmable AI planning
- Change planning tool calls from direct writes into structured task/routine proposals.
- Render proposals inline with **Подтвердить** and **Отменить**.
- Only confirmation executes the validated change for the authenticated user.
- Support one-off task creation, routine creation/update, day schedule proposals, and moving a dated task.
- Preserve friendly chat, full history, and existing personal-data context.

## 6. Settings
- Restyle the existing settings route as grouped iPhone-style rows rather than one large form card.
- Include profile/name, notifications, appearance, AI settings, data management, and About Lumen.
- Link Settings from the AI header and retain the current app header access.
- Reuse current profile fields, theme control, notification permission flow, and sign-out behavior.

## Technical details
- Refactor the planner/routine/chat parts of the large app file into focused components where helpful; do not rewrite unrelated Journal, Home, metrics, gaming, health, or workout logic.
- Keep current tables and RLS. Add a migration only if proposal persistence cannot be safely represented in the current message data; prefer transient proposals returned by the server.
- Update AI Gateway handling to surface terminal errors and avoid automatic retries; verify a real AI request after changes.
- Keep every input at 16px or larger on iPhone and use dynamic viewport height plus safe-area insets.

## Verification
- Verify one-off and recurring quick add, chronological placement, untimed placement, completion, edit, delete, and reminder time.
- Verify routine reorder, toggle, weekday editing, and today/future scope without modifying past instances.
- Verify AI proposal cancel makes no write and confirm makes exactly the proposed write.
- Verify Home is visually and functionally unchanged.
- Test the five-tab bar, Journal/Sleep access, settings, AI scrolling/composer, and keyboard behavior at iPhone and desktop sizes.
