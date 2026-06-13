import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LumenLogo } from "@/components/lumen-logo";
import { ArrowLeft, Loader2, LogOut, Plus, Trash2, RefreshCw, Gamepad2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { syncGaming, saveGamingProfile } from "@/lib/gaming.functions";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Настройки — Lumen" }] }),
  component: SettingsPage,
});

const INTERESTS = [
  "Спорт", "Киберспорт", "Питание", "Тренировки", "Учёба",
  "Работа", "Мысли", "Чтение", "Медитация", "Финансы",
  "Творчество", "Сон",
];

type CustomMetric = { id: string; name: string; unit: string | null; kind: string };

function SettingsPage() {
  const navigate = useNavigate();
  const sync = useServerFn(syncGaming);
  const saveGaming = useServerFn(saveGamingProfile);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [email, setEmail] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [steamId, setSteamId] = useState("");
  const [faceit, setFaceit] = useState("");
  const [syncing, setSyncing] = useState(false);

  const [metrics, setMetrics] = useState<CustomMetric[]>([]);
  const [newMetric, setNewMetric] = useState("");
  const [newUnit, setNewUnit] = useState("");

  async function loadAll() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    setEmail(u.user.email ?? "");
    const [{ data }, m] = await Promise.all([
      supabase.from("profiles").select("display_name, age, gender, interests, steam_id, faceit_nickname").eq("id", u.user.id).maybeSingle(),
      supabase.from("custom_metrics").select("id, name, unit, kind").eq("user_id", u.user.id).order("sort_order"),
    ]);
    setName(data?.display_name ?? "");
    setAge(data?.age != null ? String(data.age) : "");
    setGender(data?.gender ?? "");
    setInterests(data?.interests ?? []);
    setSteamId(data?.steam_id ?? "");
    setFaceit(data?.faceit_nickname ?? "");
    setMetrics((m.data ?? []) as CustomMetric[]);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const ageNum = age.trim() ? parseInt(age, 10) : null;
    const { error } = await supabase.from("profiles").upsert({
      id: u.user!.id,
      display_name: name.trim() || null,
      age: Number.isFinite(ageNum) ? ageNum : null,
      gender: gender || null,
      interests,
    });
    if (error) toast.error(error.message);
    else {
      await saveGaming({ data: { steam_id: steamId.trim() || null, faceit_nickname: faceit.trim() || null } });
      toast.success("Сохранено");
    }
    setSaving(false);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await sync({});
      if (res.errors?.length) toast.error(res.errors.join(" • "));
      else toast.success("Данные обновлены");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSyncing(false);
    }
  }

  async function addMetric() {
    if (!newMetric.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("custom_metrics").insert({
      user_id: u.user!.id, name: newMetric.trim(), unit: newUnit.trim() || null, sort_order: metrics.length,
    }).select("id, name, unit, kind").single();
    if (error) return toast.error(error.message);
    setMetrics((m) => [...m, data as CustomMetric]);
    setNewMetric(""); setNewUnit("");
  }

  async function deleteMetric(id: string) {
    const { error } = await supabase.from("custom_metrics").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setMetrics((m) => m.filter((x) => x.id !== id));
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
      <header className="relative z-10 mx-auto flex max-w-2xl items-center justify-between px-5 pt-3 sm:px-8 sm:pt-4">
        <Link to="/app" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/40 backdrop-blur">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <LumenLogo />
        <div className="w-9" />
      </header>

      <main className="relative z-10 mx-auto max-w-2xl px-5 pb-32 pt-6 sm:px-8">
        <h1 className="mb-6 font-serif text-3xl tracking-tight">Настройки</h1>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <form onSubmit={save} className="flex flex-col gap-5">
            <Section title="Профиль">
              <Field label="Имя">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Как тебя звать?"
                  className="h-12 w-full rounded-2xl border border-input bg-card px-4 text-sm outline-none focus:border-foreground" />
              </Field>
              <Field label="Возраст">
                <input type="number" min="1" max="120" value={age} onChange={(e) => setAge(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-input bg-card px-4 text-sm outline-none focus:border-foreground" />
              </Field>
              <Field label="Пол">
                <div className="flex gap-2">
                  {[{ id: "male", label: "Мужской" }, { id: "female", label: "Женский" }, { id: "other", label: "Другое" }].map((g) => (
                    <button key={g.id} type="button" onClick={() => setGender(g.id)}
                      className={`h-11 flex-1 rounded-2xl border text-sm transition-colors ${
                        gender === g.id ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}>{g.label}</button>
                  ))}
                </div>
              </Field>
              <Field label="Email">
                <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{email}</div>
              </Field>
            </Section>

            <Section title="Что отслеживаешь">
              <div className="flex flex-wrap gap-1.5">
                {INTERESTS.map((tag) => {
                  const active = interests.includes(tag);
                  return (
                    <button key={tag} type="button"
                      onClick={() => setInterests((p) => active ? p.filter((t) => t !== tag) : [...p, tag])}
                      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        active ? "border-foreground bg-foreground text-background" : "border-input bg-card text-muted-foreground hover:text-foreground"
                      }`}>{tag}</button>
                  );
                })}
              </div>
            </Section>

            <Section title="Свои трекеры">
              <p className="text-xs text-muted-foreground">Создай свои метрики (например «KDA», «калории», «часы кода»). AI будет учитывать их в анализе.</p>
              <div className="flex flex-col gap-2">
                {metrics.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
                    <div className="text-sm">{m.name}{m.unit && <span className="text-muted-foreground"> · {m.unit}</span>}</div>
                    <button type="button" onClick={() => deleteMetric(m.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input value={newMetric} onChange={(e) => setNewMetric(e.target.value)} placeholder="Название"
                    className="h-11 flex-1 rounded-2xl border border-input bg-card px-4 text-sm outline-none focus:border-foreground" />
                  <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="ед."
                    className="h-11 w-20 rounded-2xl border border-input bg-card px-3 text-sm outline-none focus:border-foreground" />
                  <button type="button" onClick={addMetric}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-border bg-card px-3 text-sm hover:bg-accent">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Section>

            <Section title="Гейминг">
              <p className="text-xs text-muted-foreground">Привяжи аккаунты — AI учтёт часы в Steam и статы Faceit.</p>
              <Field label="SteamID64 (17 цифр)">
                <input value={steamId} onChange={(e) => setSteamId(e.target.value)} placeholder="76561198..."
                  className="h-12 w-full rounded-2xl border border-input bg-card px-4 text-sm outline-none focus:border-foreground" />
              </Field>
              <Field label="Faceit ник">
                <input value={faceit} onChange={(e) => setFaceit(e.target.value)} placeholder="nickname"
                  className="h-12 w-full rounded-2xl border border-input bg-card px-4 text-sm outline-none focus:border-foreground" />
              </Field>
              <button type="button" onClick={handleSync} disabled={syncing}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-card text-sm hover:bg-accent disabled:opacity-50">
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Синхронизировать <Gamepad2 className="h-4 w-4 opacity-50" />
              </button>
              <p className="text-[10px] text-muted-foreground">
                Steam: профиль должен быть публичным. SteamID64 узнать на steamid.io.
              </p>
            </Section>

            <button type="submit" disabled={saving}
              className="mt-2 inline-flex h-12 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
            </button>

            <button type="button" onClick={signOut}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border text-sm text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" /> Выйти
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card/30 p-4">
      <h2 className="text-xs uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
