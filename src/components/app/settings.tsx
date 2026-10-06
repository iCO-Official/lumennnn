import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
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
  Languages,
  Download,
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
import { isStandalone, useInstallPrompt } from "@/lib/install";
import { Switch } from "@/components/ui/switch";
import { AI_AUTO_APPLY_KEY, useLocalFlag } from "@/lib/use-local-flag";
import { LANGUAGES, getLang, getLocale, isLangManual, setLang, tr, type Lang } from "@/lib/i18n";

const INTERESTS = [
  { id: "sport", label: tr("Спорт и тренировки") },
  { id: "gaming", label: tr("Киберспорт / игры") },
  { id: "nutrition", label: tr("Питание") },
  { id: "journal", label: tr("Мысли и дневник") },
];

type Stats = {
  todayDone: number;
  todayTotal: number;
  routines: number;
  journal: number;
  sleepAvg: number | null;
};

/** Settings content: the last tab of the app and the /app/settings page. */
export function SettingsView() {
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
    else toast.success(tr("Профиль сохранён"));
    setSaving(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const initial = (name || email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <h1 className="font-serif text-4xl tracking-tight">{tr("Настройки")}</h1>

      {/* Profile card */}
      <div className="flex items-center gap-4 rounded-3xl bg-card p-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-foreground font-serif text-2xl text-background">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-medium">{name || tr("Без имени")}</p>
          <p className="truncate text-sm text-muted-foreground">{email}</p>
          {since && (
            <p className="text-xs text-muted-foreground">
              {tr("С Lumen с")}{" "}
              {new Intl.DateTimeFormat(getLocale(), { day: "numeric", month: "long" }).format(
                new Date(since),
              )}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label={tr("Сегодня")}
          value={stats ? `${stats.todayDone}/${stats.todayTotal}` : "—"}
          hint={tr("дел выполнено")}
        />
        <StatTile
          label={tr("Повторы")}
          value={stats ? String(stats.routines) : "—"}
          hint={tr("активных")}
        />
        <StatTile
          label={tr("Дневник")}
          value={stats ? String(stats.journal) : "—"}
          hint={tr("записей")}
        />
        <StatTile
          label={tr("Сон")}
          value={stats?.sleepAvg != null ? tr("{0} ч", { 0: stats.sleepAvg.toFixed(1) }) : "—"}
          hint={tr("в среднем за неделю")}
        />
      </div>

      <Section title={tr("Напоминания")} icon={<Bell className="h-4 w-4" />}>
        <NotificationsCard />
      </Section>

      <Section title="AI" icon={<Sparkles className="h-4 w-4" />}>
        <AiSettings />
      </Section>

      <Section title={tr("Оформление")} icon={<Palette className="h-4 w-4" />}>
        <ThemePicker />
      </Section>

      <Section title={tr("Язык")} icon={<Languages className="h-4 w-4" />}>
        <LanguagePicker />
      </Section>

      <Section title={tr("Профиль")} icon={<User className="h-4 w-4" />}>
        {loading ? (
          <div className="flex h-24 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <form onSubmit={save} className="flex flex-col gap-4 p-4">
            <p className="text-xs text-muted-foreground">
              {tr("AI обращается к тебе по имени и учитывает возраст и интересы.")}
            </p>
            <Field label={tr("Имя")}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tr("Как тебя звать?")}
                className="h-12 w-full rounded-2xl border border-input bg-background px-4 text-base outline-none focus:border-foreground"
              />
            </Field>
            <Field label={tr("Возраст")}>
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
            <Field label={tr("Пол")}>
              <div className="flex gap-2">
                {[
                  { id: "male", label: tr("Мужской") },
                  { id: "female", label: tr("Женский") },
                  { id: "other", label: tr("Другое") },
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
            <Field label={tr("Интересы")}>
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
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : tr("Сохранить профиль")}
            </button>
          </form>
        )}
      </Section>

      <Section title={tr("Разделы")} icon={<Sparkles className="h-4 w-4" />}>
        <Link to="/app/more" className="flex items-center justify-between px-4 py-3.5">
          <span>
            {tr("Ещё")}
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {tr("Тренировки, здоровье, метрики, игры, статистика")}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </Section>

      <Section title={tr("Приложение")} icon={<Smartphone className="h-4 w-4" />}>
        <AppInfo />
      </Section>

      <button
        type="button"
        onClick={signOut}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-card text-sm text-destructive"
      >
        <LogOut className="h-4 w-4" /> {tr("Выйти из аккаунта")}
      </button>
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

function AiSettings() {
  const [autoApply, setAutoApply] = useLocalFlag(AI_AUTO_APPLY_KEY);
  return (
    <label className="flex items-center justify-between gap-4 px-4 py-3.5">
      <span>
        {tr("Применять без подтверждения")}
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {tr("AI сразу добавляет, меняет и удаляет дела. «Удалить всё» всё равно спросит.")}
        </span>
      </span>
      <Switch checked={autoApply} onCheckedChange={setAutoApply} />
    </label>
  );
}

function LanguagePicker() {
  const value = isLangManual() ? getLang() : "auto";
  return (
    <label className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm">{tr("Язык приложения")}</span>
      <select
        value={value}
        onChange={(e) => setLang(e.target.value as Lang | "auto")}
        className="h-10 max-w-[55%] rounded-xl border border-input bg-background px-3 text-sm"
      >
        <option value="auto">{tr("Как на устройстве")}</option>
        {LANGUAGES.map((lang) => (
          <option key={lang.id} value={lang.id}>
            {lang.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const options = [
    { id: "dark", label: tr("Тёмная"), icon: Moon },
    { id: "light", label: tr("Светлая"), icon: Sun },
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
  const install = useInstallPrompt();
  useEffect(() => {
    setStandalone(isStandalone());
  }, []);
  return (
    <div>
      <Row
        label={tr("Установлено как приложение")}
        value={standalone == null ? "—" : standalone ? tr("Да") : tr("Нет")}
      />
      {install && (
        <div className="border-b border-border p-2">
          <button
            type="button"
            onClick={() => void install()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-medium text-background"
          >
            <Download className="h-4 w-4" />
            {tr("Установить на это устройство")}
          </button>
        </div>
      )}
      <Row
        label={tr("Часовой пояс")}
        value={typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "—"}
      />
      <Row label={tr("Версия")} value={import.meta.env.VITE_APP_VERSION || "dev"} />
    </div>
  );
}

const PUSH_TEXT: Record<PushStatus, string> = {
  on: tr("Включены на этом устройстве"),
  off: tr("Выключены"),
  denied: tr("Запрещены в настройках iPhone: Настройки → Уведомления → Lumen"),
  "needs-install": tr("Добавь Lumen на экран «Домой» и открой оттуда"),
  unsupported: tr("Этот браузер не поддерживает уведомления"),
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
      toast.error(error instanceof Error ? error.message : tr("Не получилось"));
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
        <span>{tr("Статус")}</span>
        <span
          className={`inline-flex items-center gap-1.5 text-right ${status === "on" ? "text-foreground" : "text-muted-foreground"}`}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${status === "on" ? "bg-emerald-400" : "bg-muted-foreground/50"}`}
          />
          {status ? PUSH_TEXT[status] : tr("Проверяю…")}
        </span>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        <li>{tr("• в момент дела")}</li>
        <li>{tr("• через час, если дело не отмечено")}</li>
        <li>{tr("• сводка «что осталось» в 9:00, 13:00, 18:00 и 21:00")}</li>
        <li>{tr("• приходят, даже когда приложение закрыто")}</li>
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
                }, tr("Включено. Тестовое уведомление придёт в течение минуты"))
              }
            >
              {tr("Включить")}
            </button>
          ) : (
            <>
              <button
                disabled={busy}
                className={button}
                onClick={() =>
                  run(requestTestPush, tr("Тестовое уведомление придёт в течение минуты"))
                }
              >
                {tr("Проверить")}
              </button>
              <button
                disabled={busy}
                className={button}
                onClick={() => run(disablePush, tr("Напоминания выключены"))}
              >
                {tr("Выключить")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
