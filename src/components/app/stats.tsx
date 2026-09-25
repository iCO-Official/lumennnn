import { localIso } from "@/lib/planner";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { analyzeWeek } from "@/lib/ai.functions";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { Health, Workout } from "./activity";
import type { Sleep } from "./journal";
import { Card, Loader, Stat } from "./shared";

type Scope = "day" | "week" | "month";

type Task = { id: string; title: string; scope: Scope; completed: boolean; scheduled_for: string };

export function StatsSection() {
  const [data, setData] = useState<{
    sleep: Sleep[];
    tasks: Task[];
    workouts: Workout[];
    health: Health[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const sinceIso = localIso(since);
      const [sleep, tasks, workouts, health] = await Promise.all([
        supabase.from("sleep_logs").select("*").gte("log_date", sinceIso),
        supabase.from("tasks").select("*").eq("skipped", false).gte("scheduled_for", sinceIso),
        supabase.from("workouts").select("*").gte("workout_date", sinceIso),
        supabase.from("health_logs").select("*").gte("log_date", sinceIso),
      ]);
      setData({
        sleep: (sleep.data ?? []) as Sleep[],
        tasks: (tasks.data ?? []) as Task[],
        workouts: (workouts.data ?? []) as Workout[],
        health: (health.data ?? []) as Health[],
      });
    })();
  }, []);

  if (!data) return <Loader />;

  const tasksDone = data.tasks.filter((t) => t.completed).length;
  const taskPct = data.tasks.length ? Math.round((tasksDone / data.tasks.length) * 100) : 0;
  const sleepAvg = data.sleep.length
    ? (data.sleep.reduce((s, l) => s + Number(l.hours), 0) / data.sleep.length).toFixed(1)
    : "—";
  const workoutsCount = data.workouts.length;
  const moodAvg = data.health.length
    ? (data.health.reduce((s, h) => s + (h.mood ?? 0), 0) / data.health.length).toFixed(1)
    : "—";

  const moodChart = [...data.health]
    .reverse()
    .map((h) => ({ date: h.log_date.slice(5), mood: h.mood, energy: h.energy }));
  const sleepChart = [...data.sleep]
    .reverse()
    .map((l) => ({ date: l.log_date.slice(5), hours: Number(l.hours) }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Задачи закрыты"
          value={`${taskPct}%`}
          sub={`${tasksDone}/${data.tasks.length}`}
        />
        <Stat label="Средний сон" value={`${sleepAvg}ч`} sub="14 дней" />
        <Stat label="Тренировок" value={String(workoutsCount)} sub="за 2 недели" />
        <Stat label="Настроение" value={moodAvg} sub="из 5" />
      </div>

      {sleepChart.length > 0 && (
        <Card title="Сон, часы">
          <div className="h-40">
            <ResponsiveContainer>
              <LineChart data={sleepChart}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="hours" stroke="var(--foreground)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {moodChart.length > 0 && (
        <Card title="Настроение и энергия">
          <div className="h-40">
            <ResponsiveContainer>
              <BarChart data={moodChart}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} domain={[0, 5]} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="mood" fill="var(--foreground)" />
                <Bar dataKey="energy" fill="var(--muted-foreground)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <AnalyzeButton />
    </div>
  );
}

function AnalyzeButton() {
  const fn = useServerFn(analyzeWeek);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const r = await fn({ data: { today: localIso() } });
      setResult(r.analysis);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-medium">AI-разбор недели</span>
      </div>
      <button
        onClick={run}
        disabled={loading}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? "Думаю…" : "Проанализировать"}
      </button>
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 whitespace-pre-wrap rounded-xl border border-border bg-background p-4 text-sm leading-relaxed"
        >
          {result}
        </motion.div>
      )}
    </div>
  );
}
