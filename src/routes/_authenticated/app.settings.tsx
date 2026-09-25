import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LumenLogo } from "@/components/lumen-logo";
import { ArrowLeft, Bell, ChevronRight, Loader2, LogOut } from "lucide-react";
import {
  disablePush,
  enablePush,
  getPushStatus,
  requestTestPush,
  type PushStatus,
} from "@/lib/push";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Настройки — Lumen" }] }),
  component: SettingsPage,
});

const INTERESTS = [
  { id: "sport", label: "Спорт и тренировки" },
  { id: "gaming", label: "Киберспорт / игры" },
  { id: "nutrition", label: "Питание" },
  { id: "journal", label: "Мысли и дневник" },
];

function SettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [email, setEmail] = useState("");
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? "");
      const { data } = await supabase
        .from("profiles")
        .select("display_name, age, gender, interests")
        .eq("id", u.user.id)
        .maybeSingle();
      setName(data?.display_name ?? "");
      setAge(data?.age != null ? String(data.age) : "");
      setGender(data?.gender ?? "");
      setInterests(data?.interests ?? []);
      setLoading(false);
    })();
  }, []);

  function toggleInterest(id: string) {
    setInterests((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

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
    else toast.success("Сохранено");
    setSaving(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="relative min-h-app bg-background text-foreground">
      <header className="relative z-10 mx-auto flex max-w-2xl items-center justify-between px-5 pt-3 sm:px-8 sm:pt-4">
        <Link
          to="/app"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/40 backdrop-blur"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <LumenLogo />
        <div className="w-9" />
      </header>

      <main className="relative z-10 mx-auto max-w-2xl px-5 pb-32 pt-6 sm:px-8">
        <h1 className="mb-6 font-serif text-3xl tracking-tight">Настройки</h1>

        <Link
          to="/app/more"
          className="mb-6 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm transition-colors hover:bg-accent"
        >
          <span>
            Ещё
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Тренировки, здоровье, метрики, игры, статистика
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <NotificationsCard />

        {loading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <form onSubmit={save} className="flex flex-col gap-4">
            <Field label="Имя">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Как тебя звать?"
                className="h-12 w-full rounded-2xl border border-input bg-card px-4 text-sm outline-none focus:border-foreground"
              />
            </Field>
            <Field label="Возраст">
              <input
                type="number"
                min="1"
                max="120"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="h-12 w-full rounded-2xl border border-input bg-card px-4 text-sm outline-none focus:border-foreground"
              />
            </Field>
            <Field label="Пол">
              <div className="flex gap-2">
                {[
                  { id: "male", label: "Мужской" },
                  { id: "female", label: "Женский" },
                  { id: "other", label: "Другое" },
                ].map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGender(g.id)}
                    className={`h-11 flex-1 rounded-2xl border text-sm transition-colors ${
                      gender === g.id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Интересы">
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((it) => {
                  const active = interests.includes(it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => toggleInterest(it.id)}
                      className={`h-10 rounded-full border px-4 text-xs transition-colors ${
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {it.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Email">
              <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                {email}
              </div>
            </Field>

            <button
              type="submit"
              disabled={saving}
              className="mt-2 inline-flex h-12 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
            </button>

            <button
              type="button"
              onClick={signOut}
              className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border text-sm text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" /> Выйти
            </button>
          </form>
        )}
      </main>
    </div>
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

const PUSH_TEXT: Record<PushStatus, string> = {
  on: "Включены на этом устройстве",
  off: "Выключены",
  denied: "Запрещены в настройках iPhone: Настройки → Уведомления → Lumen",
  "needs-install": "Добавь Lumen на экран «Домой» и открой оттуда",
  unsupported: "Этот браузер не поддерживает уведомления",
};

function NotificationsCard() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getPushStatus().then(setStatus);
  }, []);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не получилось");
    } finally {
      setStatus(await getPushStatus());
      setBusy(false);
    }
  }

  const button =
    "h-10 flex-1 rounded-full border border-border text-sm transition-colors hover:bg-accent disabled:opacity-50";
  return (
    <div className="mb-6 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        <Bell className="h-4 w-4" /> Напоминания
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {status ? PUSH_TEXT[status] : "Проверяю…"}
      </p>
      {(status === "on" || status === "off") && (
        <div className="mt-3 flex gap-2">
          {status === "off" ? (
            <button
              disabled={busy}
              className={button}
              onClick={() =>
                run(async () => {
                  await enablePush();
                  await requestTestPush();
                }, "Включено. Тестовое уведомление придёт в течение минуты")
              }
            >
              Включить
            </button>
          ) : (
            <>
              <button
                disabled={busy}
                className={button}
                onClick={() => run(requestTestPush, "Тестовое уведомление придёт в течение минуты")}
              >
                Проверить
              </button>
              <button
                disabled={busy}
                className={button}
                onClick={() => run(disablePush, "Напоминания выключены")}
              >
                Выключить
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
