import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { z } from "zod";
import { toast } from "sonner";
import { LumenLogo } from "@/components/lumen-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { ArrowLeft, Loader2 } from "lucide-react";

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

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  const isSignup = mode === "signup";

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/app",
            data: { name },
          },
        });
        if (error) throw error;
        toast.success("Проверь почту для подтверждения", { description: "Письмо отправлено на " + email });
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

  async function handleOAuth(provider: "google" | "apple") {
    setOauthLoading(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin + "/app",
      });
      if (result.error) {
        toast.error(result.error.message || "Не удалось войти");
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/app" });
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-50" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[500px] bg-glow" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 pt-6 sm:px-8">
        <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Назад
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
            {isSignup ? "Создай аккаунт за 30 секунд." : "Войди, чтобы продолжить."}
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <button
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
            <button
              onClick={() => handleOAuth("apple")}
              disabled={!!oauthLoading}
              className="inline-flex h-11 items-center justify-center gap-3 rounded-full border border-border bg-background text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              {oauthLoading === "apple" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <AppleIcon />
              )}
              Продолжить с Apple
            </button>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            или с email
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="flex flex-col gap-3">
            {isSignup && (
              <input
                type="text"
                placeholder="Имя"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-xl border border-input bg-background px-4 text-sm outline-none transition-colors focus:border-foreground"
              />
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
      <path fill="#FFC107" d="M21.8 10.4H12v3.5h5.6c-.5 2.5-2.6 4-5.6 4-3.3 0-6-2.7-6-6s2.7-6 6-6c1.5 0 2.9.6 4 1.5l2.5-2.5C16.9 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c5.5 0 9.6-3.9 9.6-9.4 0-.6 0-1.2-.2-1.8z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden>
      <path d="M16.4 12.7c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2.1-.9-3.4-.9-1.8 0-3.4 1-4.3 2.6-1.8 3.2-.5 7.9 1.3 10.5.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.8 3.4-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.2-2.5.7-1 1.3-2 1.6-3.1-3.1-1.2-3.1-3-3.1-3.2zM13.8 4.7c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.5-.7.8-1.3 2-1.1 3.2 1.2.1 2.3-.6 3-1.4z" />
    </svg>
  );
}
