// Pure date/recurrence helpers shared by the client planner and server code.
// Dates are local calendar days as "YYYY-MM-DD" strings.

export type RoutineRule = {
  weekdays: number[]; // 0 = Sunday … 6 = Saturday
  starts_on: string;
  ends_on: string | null;
};

export function isoAddDays(iso: string, amount: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function isoWeekday(iso: string) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** Days in [from, to] on which the routine occurs. */
export function routineOccurrences(rule: RoutineRule, from: string, to: string) {
  const start = rule.starts_on > from ? rule.starts_on : from;
  const end = rule.ends_on && rule.ends_on < to ? rule.ends_on : to;
  const days: string[] = [];
  for (let iso = start; iso <= end; iso = isoAddDays(iso, 1)) {
    if (rule.weekdays.includes(isoWeekday(iso))) days.push(iso);
  }
  return days;
}

/**
 * Parses a quick schedule, one item per line: "06:00 Подъём", "6.30 — Душ",
 * or just "Купить тетрадь" (no time).
 */
export function parseScheduleLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d{1,2})[:.](\d{2})\s*[-–—]?\s*(.*)$/);
      if (match && Number(match[1]) < 24 && Number(match[2]) < 60 && match[3].trim())
        return { time: `${match[1].padStart(2, "0")}:${match[2]}`, title: match[3].trim() };
      return { time: null, title: line };
    });
}

const REPEAT_SHORT_DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** "Каждый день", "По будням", "Пн · Ср · Пт" … for weekday numbers 0=Вс…6=Сб. */
export function repeatLabel(days: number[]) {
  const set = new Set(days);
  if (set.size === 7) return "Каждый день";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "По будням";
  if (set.size === 2 && set.has(0) && set.has(6)) return "По выходным";
  return [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => set.has(d))
    .map((d) => REPEAT_SHORT_DAYS[d])
    .join(" · ");
}
