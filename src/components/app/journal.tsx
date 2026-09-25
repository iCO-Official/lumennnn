import { localIso } from "@/lib/planner";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Empty, Loader, MoodPicker, formatDate, moodEmoji } from "./shared";

type Journal = {
  id: string;
  content: string;
  mood: number | null;
  entry_date: string;
  created_at: string;
};

export function JournalSection() {
  const [tab, setTab] = useState<"thoughts" | "sleep">("thoughts");
  return (
    <div>
      <div className="mb-5 grid grid-cols-2 border-b border-border">
        <button
          onClick={() => setTab("thoughts")}
          className={`border-b-2 py-3 text-sm ${tab === "thoughts" ? "border-foreground" : "border-transparent text-muted-foreground"}`}
        >
          Мысли
        </button>
        <button
          onClick={() => setTab("sleep")}
          className={`border-b-2 py-3 text-sm ${tab === "sleep" ? "border-foreground" : "border-transparent text-muted-foreground"}`}
        >
          Сон
        </button>
      </div>
      {tab === "thoughts" ? <JournalEntriesSection /> : <SleepSection />}
    </div>
  );
}

function JournalEntriesSection() {
  const [entries, setEntries] = useState<Journal[]>([]);
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<number>(3);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("journal_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setEntries((data ?? []) as Journal[]);
    setLoading(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setAdding(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("journal_entries")
      .insert({ user_id: u.user!.id, content: content.trim(), mood })
      .select("*")
      .single();
    if (error) toast.error(error.message);
    else if (data) setEntries((e) => [data as Journal, ...e]);
    setContent("");
    setAdding(false);
  }

  async function remove(id: string) {
    setEntries((e) => e.filter((x) => x.id !== id));
    await supabase.from("journal_entries").delete().eq("id", id);
  }

  return (
    <div>
      <form onSubmit={add} className="mb-6 rounded-2xl border border-border bg-card p-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Что в голове сегодня?"
          rows={3}
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-3 flex items-center justify-between">
          <MoodPicker value={mood} onChange={setMood} />
          <button
            type="submit"
            disabled={adding || !content.trim()}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-foreground px-4 text-xs font-medium text-background disabled:opacity-40"
          >
            {adding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Записать
          </button>
        </div>
      </form>

      {loading ? (
        <Loader />
      ) : entries.length === 0 ? (
        <Empty text="Дневник пуст. Запиши первую мысль." />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((j) => (
            <li key={j.id} className="group rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="mb-1 text-xs text-muted-foreground">
                    {formatDate(j.created_at)} · настроение {moodEmoji(j.mood)}
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{j.content}</p>
                </div>
                <button
                  onClick={() => remove(j.id)}
                  className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type Sleep = { id: string; log_date: string; hours: number; quality: number | null };

export function SleepSection() {
  const [logs, setLogs] = useState<Sleep[]>([]);
  const [hours, setHours] = useState("8");
  const [quality, setQuality] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);
  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("sleep_logs")
      .select("*")
      .order("log_date", { ascending: false })
      .limit(30);
    setLogs((data ?? []) as Sleep[]);
    setLoading(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const h = parseFloat(hours);
    if (!h || h < 0 || h > 24) {
      toast.error("Часы выглядят странно");
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const today = localIso();
    const { data, error } = await supabase
      .from("sleep_logs")
      .upsert(
        { user_id: u.user!.id, hours: h, quality, log_date: today },
        { onConflict: "user_id,log_date" },
      )
      .select("*")
      .single();
    if (error) toast.error(error.message);
    else if (data) {
      setLogs((l) => [data as Sleep, ...l.filter((x) => x.log_date !== (data as Sleep).log_date)]);
      toast.success("Сон записан");
    }
    setSaving(false);
  }

  const chartData = useMemo(
    () =>
      [...logs].reverse().map((l) => ({
        date: l.log_date.slice(5),
        hours: Number(l.hours),
        quality: l.quality ?? 0,
      })),
    [logs],
  );
  const avg = logs.length
    ? (logs.reduce((s, l) => s + Number(l.hours), 0) / logs.length).toFixed(1)
    : "—";

  return (
    <div>
      <form onSubmit={save} className="mb-6 rounded-2xl border border-border bg-card p-5">
        <div className="mb-1 text-xs text-muted-foreground">Сегодня я спал</div>
        <div className="flex items-end gap-3">
          <input
            type="number"
            step="0.5"
            min="0"
            max="24"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="h-14 w-24 rounded-xl border border-input bg-background px-3 text-2xl font-serif outline-none focus:border-foreground"
          />
          <span className="pb-2 text-sm text-muted-foreground">часов</span>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-xs text-muted-foreground">Качество</div>
          <MoodPicker value={quality} onChange={setQuality} />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}Сохранить
        </button>
      </form>

      <div className="mb-6 rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Среднее за {logs.length} дней</span>
          <span className="font-serif text-2xl">
            {avg}
            <span className="ml-1 text-sm text-muted-foreground">ч</span>
          </span>
        </div>
        {chartData.length > 0 && (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} domain={[0, 12]} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="hours"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {loading ? (
        <Loader />
      ) : logs.length === 0 ? (
        <Empty text="Ещё нет записей." />
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.slice(0, 7).map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm"
            >
              <span className="text-muted-foreground">{l.log_date}</span>
              <span>
                <span className="font-medium">{Number(l.hours)}ч</span>{" "}
                <span className="text-muted-foreground">{moodEmoji(l.quality)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
