import { localIso } from "@/lib/planner";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import { Sparkles, CalendarClock, Ruler, Bell } from "lucide-react";
import { toast } from "sonner";
import { dailyBrief } from "@/lib/ai.functions";
import { scheduleRoutineReminders, remindNow } from "@/lib/reminders";
import { Loader } from "./shared";

export type Section = "home" | "plans" | "routine" | "journal" | "sleep" | "ai" | "metrics";

type Brief = { emoji: string; mood: string; message: string; tips: string[] };

export function HomeSection({ onGo }: { onGo: (s: Section) => void }) {
  const brief = useServerFn(dailyBrief);
  const [data, setData] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifState, setNotifState] = useState<string>("default");
  const todayIso = localIso();

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setNotifState(Notification.permission);
      if (Notification.permission === "granted") void scheduleRoutineReminders();
    }
    const cacheKey = "lumen-brief-" + todayIso;
    const cached = typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null;
    if (cached) {
      try {
        setData(JSON.parse(cached));
        setLoading(false);
        return;
      } catch {
        /* ignore */
      }
    }
    (async () => {
      try {
        const r = await brief({ data: { today: localIso() } });
        setData(r);
        localStorage.setItem(cacheKey, JSON.stringify(r));
      } catch {
        setData({ emoji: "🙂", mood: "", message: "Я рядом. Расскажи, как день?", tips: [] });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function enableNotifications() {
    if (typeof Notification === "undefined") {
      toast.error("Уведомления не поддерживаются");
      return;
    }
    const p = await Notification.requestPermission();
    setNotifState(p);
    if (p === "granted") {
      await scheduleRoutineReminders();
      new Notification("Lumen", {
        body: "Готово — буду напоминать про твои дела 🙌",
        icon: "/icon-192.png",
      });
    } else {
      toast.error("Разреши уведомления в настройках браузера");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl border border-border bg-card p-6 text-center">
        {loading ? (
          <div className="py-8">
            <Loader />
          </div>
        ) : (
          <>
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", bounce: 0.4 }}
              className="text-7xl leading-none"
            >
              {data?.emoji ?? "🙂"}
            </motion.div>
            {data?.mood && (
              <div className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">
                {data.mood}
              </div>
            )}
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-foreground">
              {data?.message}
            </p>
            <button
              onClick={() => onGo("ai")}
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background"
            >
              <Sparkles className="h-4 w-4" /> Поговорить
            </button>
          </>
        )}
      </div>

      {!!data?.tips?.length && (
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
            Советы на сегодня
          </div>
          <ul className="flex flex-col gap-3">
            {data.tips.map((t, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onGo("routine")}
          className="flex flex-col items-start gap-2 rounded-3xl border border-border bg-card p-5 text-left hover:bg-accent"
        >
          <CalendarClock className="h-5 w-5" />
          <span className="text-sm font-medium">Рутина на сегодня</span>
        </button>
        <button
          onClick={() => onGo("metrics")}
          className="flex flex-col items-start gap-2 rounded-3xl border border-border bg-card p-5 text-left hover:bg-accent"
        >
          <Ruler className="h-5 w-5" />
          <span className="text-sm font-medium">Мои метрики</span>
        </button>
      </div>

      {notifState !== "granted" ? (
        <button
          onClick={enableNotifications}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card text-sm hover:bg-accent"
        >
          <Bell className="h-4 w-4" /> Включить напоминания
        </button>
      ) : (
        <button
          onClick={async () => {
            const left = await remindNow();
            toast.success(left === 0 ? "Всё сделано на сегодня 🎉" : `Осталось дел: ${left}`);
          }}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card text-sm hover:bg-accent"
        >
          <Bell className="h-4 w-4" /> Что я ещё не сделал
        </button>
      )}
    </div>
  );
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

export function todayLabel() {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}
