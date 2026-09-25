import { localIso } from "@/lib/planner";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Empty, Field, Loader, MoodPicker, moodEmoji } from "./shared";

export type Workout = {
  id: string;
  title: string;
  kind: string | null;
  duration_min: number | null;
  intensity: number | null;
  workout_date: string;
};

export function WorkoutsSection() {
  const [items, setItems] = useState<Workout[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("strength");
  const [duration, setDuration] = useState("45");
  const [intensity, setIntensity] = useState(3);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);
  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("workouts")
      .select("*")
      .order("workout_date", { ascending: false })
      .limit(30);
    setItems((data ?? []) as Workout[]);
    setLoading(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("workouts")
      .insert({
        user_id: u.user!.id,
        title: title.trim(),
        kind,
        duration_min: duration ? parseInt(duration) : null,
        intensity,
      })
      .select("*")
      .single();
    if (error) toast.error(error.message);
    else if (data) {
      setItems((l) => [data as Workout, ...l]);
      setTitle("");
      toast.success("Записано");
    }
  }

  async function remove(id: string) {
    setItems((l) => l.filter((x) => x.id !== id));
    await supabase.from("workouts").delete().eq("id", id);
  }

  const KINDS = ["strength", "cardio", "stretch", "sport"];
  const labels: Record<string, string> = {
    strength: "Сила",
    cardio: "Кардио",
    stretch: "Растяжка",
    sport: "Спорт",
  };

  return (
    <div>
      <form onSubmit={add} className="mb-6 rounded-2xl border border-border bg-card p-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например: ноги, бег 5 км"
          className="mb-3 h-11 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none focus:border-foreground"
        />
        <div className="mb-3 flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${kind === k ? "border-foreground bg-foreground text-background" : "border-input text-muted-foreground hover:text-foreground"}`}
            >
              {labels[k]}
            </button>
          ))}
        </div>
        <div className="mb-3 flex items-center gap-3">
          <input
            type="number"
            min="0"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="h-11 w-24 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-foreground"
          />
          <span className="text-sm text-muted-foreground">минут</span>
        </div>
        <div className="mb-3">
          <div className="mb-1.5 text-xs text-muted-foreground">Интенсивность</div>
          <MoodPicker value={intensity} onChange={setIntensity} />
        </div>
        <button
          type="submit"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background"
        >
          <Plus className="h-4 w-4" />
          Добавить тренировку
        </button>
      </form>

      {loading ? (
        <Loader />
      ) : items.length === 0 ? (
        <Empty text="Ещё ни одной тренировки." />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((w) => (
            <li
              key={w.id}
              className="group flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium">{w.title}</div>
                <div className="text-xs text-muted-foreground">
                  {w.workout_date} · {labels[w.kind || ""] ?? w.kind} · {w.duration_min ?? 0} мин
                </div>
              </div>
              <button
                onClick={() => remove(w.id)}
                className="opacity-0 hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type Health = {
  id: string;
  log_date: string;
  mood: number | null;
  energy: number | null;
  water_ml: number | null;
  steps: number | null;
  weight_kg: number | null;
};

export function HealthSection() {
  const [logs, setLogs] = useState<Health[]>([]);
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [water, setWater] = useState("");
  const [steps, setSteps] = useState("");
  const [weight, setWeight] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);
  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("health_logs")
      .select("*")
      .order("log_date", { ascending: false })
      .limit(30);
    setLogs((data ?? []) as Health[]);
    setLoading(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const today = localIso();
    const payload = {
      user_id: u.user!.id,
      log_date: today,
      mood,
      energy,
      water_ml: water ? parseInt(water) : null,
      steps: steps ? parseInt(steps) : null,
      weight_kg: weight ? parseFloat(weight) : null,
    };
    const { data, error } = await supabase
      .from("health_logs")
      .upsert(payload, { onConflict: "user_id,log_date" })
      .select("*")
      .single();
    if (error) toast.error(error.message);
    else if (data) {
      setLogs((l) => [
        data as Health,
        ...l.filter((x) => x.log_date !== (data as Health).log_date),
      ]);
      toast.success("Сохранено");
    }
    setSaving(false);
  }

  return (
    <div>
      <form onSubmit={save} className="mb-6 rounded-2xl border border-border bg-card p-5">
        <div className="mb-4">
          <div className="mb-1.5 text-xs text-muted-foreground">Настроение</div>
          <MoodPicker value={mood} onChange={setMood} />
        </div>
        <div className="mb-4">
          <div className="mb-1.5 text-xs text-muted-foreground">Энергия</div>
          <MoodPicker value={energy} onChange={setEnergy} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Вода, мл" value={water} onChange={setWater} placeholder="2000" />
          <Field label="Шаги" value={steps} onChange={setSteps} placeholder="8000" />
          <Field label="Вес, кг" value={weight} onChange={setWeight} placeholder="70" />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}Сохранить день
        </button>
      </form>

      {loading ? (
        <Loader />
      ) : logs.length === 0 ? (
        <Empty text="Записей нет." />
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.slice(0, 10).map((h) => (
            <li key={h.id} className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
              <div className="mb-1 text-xs text-muted-foreground">{h.log_date}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>Настр {moodEmoji(h.mood)}</span>
                <span>Энерг {moodEmoji(h.energy)}</span>
                {h.water_ml != null && <span>💧 {h.water_ml}мл</span>}
                {h.steps != null && <span>👟 {h.steps}</span>}
                {h.weight_kg != null && <span>⚖️ {Number(h.weight_kg)}кг</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
