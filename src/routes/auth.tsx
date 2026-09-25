import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { z } from "zod";
import { toast } from "sonner";
import { LumenLogo } from "@/components/lumen-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader as Loader2 } from "lucide-react";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).catch("signin"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Вход в Lumen" },
      { name: "description", content: "Войди или зарегистрируйся в Lumen — твоём ежедневнике." },
    ],
  }),
  component: AuthPage,
});

const GENDERS = [
  { id: "male", label: "Парень" },
  { id: "female", label: "Девушка" },
  { id: "other", label: "Другое" },
];

const INTERESTS = [
  { id: "sport", label: "Спорт и тренировки" },
  { id: "gaming", label: "Киберспорт / игры" },
  { id: "nutrition", label: "Питание" },
  { id: "journal", label: "Мысли и дневник" },
];

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<string>("");
  const [interests, setInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setHasSession(true);
        navigate({ to: "/app" });
      }
    });
  }, [navigate]);

  const isSignup = mode === "signup";

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignup) {
        if (!name.trim()) throw new Error("Укажи имя");
        if (!gender) throw new Error("Выбери пол");
        const ageNum = age ? Number(age) : null;
        if (ageNum !== null && (Number.isNaN(ageNum) || ageNum < 5 || ageNum > 120)) {
          throw new Error("Возраст выглядит странно");
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/app",
            data: {
              name: name.trim(),
              age: ageNum ? String(ageNum) : "",
              gender,
              interests: JSON.stringify(interests),
            },
          },
        });
        if (error) throw error;
        toast.success("Готово! Проверь почту", { description: "Подтверди email и заходи." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/app" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Что-то пошло не так";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google") {
    setOauthLoading(provider);
    try {
      // Redirects to the provider; Supabase restores the session on return to /app.
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/app` },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Не удалось войти";
      toast.error(message);
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-50" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[500px] bg-glow" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 pt-6 sm:px-8">
        <Link
          to={hasSession ? "/app" : "/"}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span translate="no">Назад</span>
        </Link>
        <LumenLogo />
        <ThemeToggle />
      </header>

      <main className="relative z-10 mx-auto flex max-w-md flex-col px-5 pb-12 pt-12 sm:px-0">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl border border-border bg-card p-7 shadow-2xl shadow-black/30"
        >
          <h1 className="font-serif text-3xl tracking-tight">
            {isSignup ? "Добро пожаловать" : "С возвращением"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isSignup
              ? "Расскажи пару штук о себе — AI будет общаться по-человечески."
              : "Войди, чтобы продолжить."}
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={!!oauthLoading}
              className="inline-flex h-11 items-center justify-center gap-3 rounded-full border border-border bg-background text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              {oauthLoading === "google" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Продолжить с Google
            </button>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            или с email
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="flex flex-col gap-3">
            {isSignup && (
              <>
                <input
                  type="text"
                  placeholder="Как тебя зовут"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-11 rounded-xl border border-input bg-background px-4 text-sm outline-none transition-colors focus:border-foreground"
                />
                <input
                  type="number"
                  placeholder="Возраст"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  min={5}
                  max={120}
                  className="h-11 rounded-xl border border-input bg-background px-4 text-sm outline-none transition-colors focus:border-foreground"
                />
                <div className="flex gap-2">
                  {GENDERS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGender(g.id)}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-xs transition-colors ${
                        gender === g.id
                          ? "border-foreground bg-foreground text-background"
                          : "border-input bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {INTERESTS.map((it) => {
                    const active = interests.includes(it.id);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() =>
                          setInterests((arr) =>
                            active ? arr.filter((x) => x !== it.id) : [...arr, it.id],
                          )
                        }
                        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "border-input bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {it.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <input
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-xl border border-input bg-background px-4 text-sm outline-none transition-colors focus:border-foreground"
            />
            <input
              type="password"
              placeholder="Пароль"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-xl border border-input bg-background px-4 text-sm outline-none transition-colors focus:border-foreground"
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSignup ? "Создать аккаунт" : "Войти"}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            {isSignup ? "Уже есть аккаунт? " : "Нет аккаунта? "}
            <Link
              to="/auth"
              search={{ mode: isSignup ? "signin" : "signup" }}
              className="text-foreground underline-offset-4 hover:underline"
            >
              {isSignup ? "Войти" : "Зарегистрироваться"}
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#FFC107"
        d="M21.8 10.4H12v3.5h5.6c-.5 2.5-2.6 4-5.6 4-3.3 0-6-2.7-6-6s2.7-6 6-6c1.5 0 2.9.6 4 1.5l2.5-2.5C16.9 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c5.5 0 9.6-3.9 9.6-9.4 0-.6 0-1.2-.2-1.8z"
      />
    </svg>
  );
}
