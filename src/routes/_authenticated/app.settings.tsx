import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Loader2,
  LogOut,
  Moon,
  Palette,
  Smartphone,
  Sparkles,
  Sun,
  User,
} from "lucide-react";
import {
  disablePush,
  enablePush,
  getPushStatus,
  requestTestPush,
  type PushStatus,
} from "@/lib/push";
import { localIso } from "@/lib/planner";
import { useTheme } from "@/components/theme-provider";
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

type Stats = {
  todayDone: number;
  todayTotal: number;
  routines: number;
  journal: number;
  sleepAvg: number | null;
};

function SettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [email, setEmail] = useState("");
  const [since, setSince] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? "");
      setSince(u.user.created_at ?? null);
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

      const today = localIso();
      const weekAgo = localIso(new Date(Date.now() - 7 * 86400000));
      const [tasks, routines, journal, sleep] = await Promise.all([
        supabase.from("tasks").select("completed").eq("scheduled_for", today).eq("skipped", false),
        supabase
          .from("routines")
          .select("id", { count: "exact", head: true })
          .eq("active", true)
          .or(`ends_on.is.null,ends_on.gte.${today}`),
        supabase.from("journal_entries").select("id", { count: "exact", head: true }),
        supabase.from("sleep_logs").select("hours").gte("log_date", weekAgo),
      ]);
      const hours = (sleep.data ?? []).map((s) => Number(s.hours)).filter((h) => h > 0);
      setStats({
        todayDone: (tasks.data ?? []).filter((t) => t.completed).length,
        todayTotal: (tasks.data ?? []).length,
        routines: routines.count ?? 0,
        journal: journal.count ?? 0,
        sleepAvg: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
      });
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
    else toast.success("Профиль сохранён");
    setSaving(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const initial = (name || email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="relative min-h-app bg-background text-foreground">
      <header className="relative z-10 mx-auto flex max-w-2xl items-center gap-3 px-5 pt-3 sm:px-8 sm:pt-4">
        <Link
          to="/app"
          aria-label="Назад"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-card"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-2xl space-y-7 px-5 pb-24 pt-4 sm:px-8">
        <h1 className="font-serif text-4xl tracking-tight">Настройки</h1>

        {/* Profile card */}
        <div className="flex items-center gap-4 rounded-3xl bg-card p-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-foreground font-serif text-2xl text-background">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-medium">{name || "Без имени"}</p>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
            {since && (
              <p className="text-xs text-muted-foreground">
                С Lumen с{" "}
                {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(
                  new Date(since),
                )}
              </p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Сегодня"
            value={stats ? `${stats.todayDone}/${stats.todayTotal}` : "—"}
            hint="дел выполнено"
          />
          <StatTile label="Рутины" value={stats ? String(stats.routines) : "—"} hint="активных" />
          <StatTile label="Дневник" value={stats ? String(stats.journal) : "—"} hint="записей" />
          <StatTile
            label="Сон"
            value={stats?.sleepAvg != null ? `${stats.sleepAvg.toFixed(1)} ч` : "—"}
            hint="в среднем за неделю"
          />
        </div>

        <Section title="Напоминания" icon={<Bell className="h-4 w-4" />}>
          <NotificationsCard />
        </Section>

        <Section title="Оформление" icon={<Palette className="h-4 w-4" />}>
          <ThemePicker />
        </Section>

        <Section title="Профиль" icon={<User className="h-4 w-4" />}>
          {loading ? (
            <div className="flex h-24 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <form onSubmit={save} className="flex flex-col gap-4 p-4">
              <p className="text-xs text-muted-foreground">
                AI обращается к тебе по имени и учитывает возраст и интересы.
              </p>
              <Field label="Имя">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Как тебя звать?"
                  className="h-12 w-full rounded-2xl border border-input bg-background px-4 text-base outline-none focus:border-foreground"
                />
              </Field>
              <Field label="Возраст">
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-input bg-background px-4 text-base outline-none focus:border-foreground"
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
                          : "border-border bg-background text-muted-foreground"
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
                            : "border-border bg-background text-muted-foreground"
                        }`}
                      >
                        {it.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-12 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background disabled:opacity-40"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить профиль"}
              </button>
            </form>
          )}
        </Section>

        <Section title="Разделы" icon={<Sparkles className="h-4 w-4" />}>
          <Link to="/app/more" className="flex items-center justify-between px-4 py-3.5">
            <span>
              Ещё
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Тренировки, здоровье, метрики, игры, статистика
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </Section>

        <Section title="Приложение" icon={<Smartphone className="h-4 w-4" />}>
          <AppInfo />
        </Section>

        <button
          type="button"
          onClick={signOut}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-card text-sm text-destructive"
        >
          <LogOut className="h-4 w-4" /> Выйти из аккаунта
        </button>
      </main>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h2>
      <div className="overflow-hidden rounded-2xl bg-card">{children}</div>
    </section>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-3xl leading-none">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const options = [
    { id: "dark", label: "Тёмная", icon: Moon },
    { id: "light", label: "Светлая", icon: Sun },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-2 p-2">
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setTheme(id)}
          className={`flex h-12 items-center justify-center gap-2 rounded-xl text-sm transition-colors ${
            theme === id ? "bg-foreground text-background" : "text-muted-foreground"
          }`}
        >
          <Icon className="h-4 w-4" /> {label}
        </button>
      ))}
    </div>
  );
}

function AppInfo() {
  const [standalone, setStandalone] = useState<boolean | null>(null);
  useEffect(() => {
    setStandalone(
      window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
  }, []);
  return (
    <div>
      <Row
        label="Установлено на экран «Домой»"
        value={standalone == null ? "—" : standalone ? "Да" : "Нет"}
      />
      <Row
        label="Часовой пояс"
        value={typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "—"}
      />
      <Row label="Версия" value={import.meta.env.VITE_APP_VERSION || "dev"} />
    </div>
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
    "h-11 flex-1 rounded-full bg-background text-sm transition-colors disabled:opacity-50";
  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>Статус</span>
        <span
          className={`inline-flex items-center gap-1.5 text-right ${status === "on" ? "text-foreground" : "text-muted-foreground"}`}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${status === "on" ? "bg-emerald-400" : "bg-muted-foreground/50"}`}
          />
          {status ? PUSH_TEXT[status] : "Проверяю…"}
        </span>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        <li>• в момент дела</li>
        <li>• через час, если дело не отмечено</li>
        <li>• сводка «что осталось» в 9:00, 13:00, 18:00 и 21:00</li>
        <li>• приходят, даже когда приложение закрыто</li>
      </ul>
      {(status === "on" || status === "off") && (
        <div className="mt-4 flex gap-2">
          {status === "off" ? (
            <button
              disabled={busy}
              className="h-11 flex-1 rounded-full bg-foreground text-sm text-background disabled:opacity-50"
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
