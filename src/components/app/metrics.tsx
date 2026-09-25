import { localIso } from "@/lib/planner";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Empty, Loader } from "./shared";

type Metric = {
  id: string;
  name: string;
  kind: string;
  unit: string | null;
  icon: string | null;
  sort_order: number;
};

type MetricLog = {
  id: string;
  metric_id: string;
  log_date: string;
  value_num: number | null;
  value_text: string | null;
  created_at: string;
};

export function MetricsSection() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [logs, setLogs] = useState<MetricLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"number" | "text">("number");
  const [newUnit, setNewUnit] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceIso = localIso(since);
    const [{ data: m }, { data: l }] = await Promise.all([
      supabase.from("custom_metrics").select("*").order("sort_order"),
      supabase
        .from("custom_metric_logs")
        .select("*")
        .gte("log_date", sinceIso)
        .order("created_at", { ascending: false }),
    ]);
    setMetrics((m ?? []) as Metric[]);
    setLogs((l ?? []) as MetricLog[]);
    setLoading(false);
  }

  async function addMetric(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("custom_metrics")
      .insert({
        user_id: u.user!.id,
        name: newName.trim(),
        kind: newKind,
        unit: newUnit.trim() || null,
        sort_order: metrics.length,
      })
      .select("*")
      .single();
    if (error) toast.error(error.message);
    else if (data) {
      setMetrics((ms) => [...ms, data as Metric]);
      setNewName("");
      setNewUnit("");
    }
  }

  async function removeMetric(id: string) {
    if (!confirm("Удалить метрику и все её записи?")) return;
    setMetrics((ms) => ms.filter((m) => m.id !== id));
    await supabase.from("custom_metrics").delete().eq("id", id);
    setLogs((ls) => ls.filter((l) => l.metric_id !== id));
  }

  async function logValue(metric: Metric, raw: string) {
    if (!raw.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const today = localIso();
    const payload = {
      user_id: u.user!.id,
      metric_id: metric.id,
      log_date: today,
      value_num: metric.kind === "number" ? parseFloat(raw) : null,
      value_text: metric.kind === "text" ? raw.trim() : null,
    };
    const { data, error } = await supabase
      .from("custom_metric_logs")
      .insert(payload)
      .select("*")
      .single();
    if (error) toast.error(error.message);
    else if (data) {
      setLogs((ls) => [data as MetricLog, ...ls]);
      toast.success("Записано");
    }
  }

  async function removeLog(id: string) {
    setLogs((ls) => ls.filter((l) => l.id !== id));
    await supabase.from("custom_metric_logs").delete().eq("id", id);
  }

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Создай свои переменные — например «Кофе чашек», «Настроение», «Время в коде». AI будет
        анализировать всё.
      </div>

      <form onSubmit={addMetric} className="mb-6 rounded-2xl border border-border bg-card p-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Название метрики"
          className="mb-3 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-foreground"
        />
        <div className="mb-3 flex gap-2">
          {(["number", "text"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setNewKind(k)}
              className={`h-10 flex-1 rounded-xl border text-xs transition-colors ${newKind === k ? "border-foreground bg-foreground text-background" : "border-input text-muted-foreground hover:text-foreground"}`}
            >
              {k === "number" ? "Число" : "Текст"}
            </button>
          ))}
        </div>
        {newKind === "number" && (
          <input
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            placeholder="Единицы (необязательно): чашек, км, мин"
            className="mb-3 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-foreground"
          />
        )}
        <button
          type="submit"
          disabled={!newName.trim()}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Создать метрику
        </button>
      </form>

      {loading ? (
        <Loader />
      ) : metrics.length === 0 ? (
        <Empty text="Пока нет метрик." />
      ) : (
        <ul className="flex flex-col gap-3">
          {metrics.map((m) => (
            <MetricCard
              key={m.id}
              metric={m}
              logs={logs.filter((l) => l.metric_id === m.id)}
              onLog={(v) => logValue(m, v)}
              onRemove={() => removeMetric(m.id)}
              onRemoveLog={removeLog}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MetricCard({
  metric,
  logs,
  onLog,
  onRemove,
  onRemoveLog,
}: {
  metric: Metric;
  logs: MetricLog[];
  onLog: (v: string) => void | Promise<void>;
  onRemove: () => void;
  onRemoveLog: (id: string) => void;
}) {
  const [val, setVal] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await onLog(val);
    setVal("");
  }
  return (
    <li className="group rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{metric.name}</div>
          <div className="text-xs text-muted-foreground">
            {metric.kind === "number" ? `Число${metric.unit ? ` · ${metric.unit}` : ""}` : "Текст"}
          </div>
        </div>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <form onSubmit={submit} className="mb-3 flex gap-2">
        <input
          type={metric.kind === "number" ? "number" : "text"}
          step="any"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={metric.kind === "number" ? `Сегодня ${metric.unit ?? ""}` : "Что записать?"}
          className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-foreground"
        />
        <button
          type="submit"
          disabled={!val.trim()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>
      {logs.length > 0 && (
        <ul className="space-y-1 text-xs">
          {logs.slice(0, 5).map((l) => (
            <li key={l.id} className="flex items-center justify-between text-muted-foreground">
              <span>
                {l.log_date} ·{" "}
                {l.value_num != null
                  ? `${l.value_num}${metric.unit ? ` ${metric.unit}` : ""}`
                  : l.value_text}
              </span>
              <button
                onClick={() => onRemoveLog(l.id)}
                className="opacity-60 hover:opacity-100 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
