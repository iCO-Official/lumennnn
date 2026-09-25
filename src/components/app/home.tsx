import { localIso } from "@/lib/planner";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import { Sparkles, CalendarClock, Ruler, Bell } from "lucide-react";
import { toast } from "sonner";
import { dailyBrief } from "@/lib/ai.functions";
import { remindNow } from "@/lib/reminders";
import {
  enablePush,
  getPushStatus,
  requestTestPush,
  syncPushSubscription,
  type PushStatus,
} from "@/lib/push";
import { Loader } from "./shared";

export type Section = "home" | "plans" | "routine" | "journal" | "sleep" | "ai" | "metrics";

type Brief = { emoji: string; mood: string; message: string; tips: string[] };

export function HomeSection({ onGo }: { onGo: (s: Section) => void }) {
  const brief = useServerFn(dailyBrief);
  const [data, setData] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [enabling, setEnabling] = useState(false);
  const todayIso = localIso();

  useEffect(() => {
    void getPushStatus().then(setPushStatus);
    void syncPushSubscription();
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
    setEnabling(true);
    try {
      await enablePush();
      await requestTestPush();
      setPushStatus("on");
      toast.success("Готово! В течение минуты придёт тестовое уведомление");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось включить уведомления");
      setPushStatus(await getPushStatus());
    } finally {
      setEnabling(false);
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

      {pushStatus === "needs-install" ? (
        <p className="rounded-3xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
          <Bell className="mx-auto mb-2 h-4 w-4" />
          Чтобы получать напоминания, добавь Lumen на экран «Домой» (Поделиться → На экран «Домой»)
          и открой оттуда.
        </p>
      ) : pushStatus && pushStatus !== "on" ? (
        <button
          onClick={enableNotifications}
          disabled={enabling}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card text-sm hover:bg-accent disabled:opacity-50"
        >
          <Bell className="h-4 w-4" /> {enabling ? "Включаю…" : "Включить напоминания"}
        </button>
      ) : pushStatus === "on" ? (
        <button
          onClick={async () => {
            const left = await remindNow();
            toast.success(left === 0 ? "Всё сделано на сегодня 🎉" : `Осталось дел: ${left}`);
          }}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card text-sm hover:bg-accent"
        >
          <Bell className="h-4 w-4" /> Что я ещё не сделал
        </button>
      ) : null}
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
