import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Calendar,
  Moon,
  Activity,
  Sparkles,
  Dumbbell,
  NotebookPen,
  ArrowRight,
  Smartphone,
} from "lucide-react";
import { LumenLogo, LumenMark } from "@/components/lumen-logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumen — твой ежедневник и AI-аналитик дня" },
      { name: "description", content: "Минималистичный планировщик задач, сна и здоровья с AI-выводами." },
      { property: "og:title", content: "Lumen — ежедневник нового поколения" },
      { property: "og:description", content: "Планируй день, неделю и месяц. AI расскажет, что улучшить." },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Calendar, title: "Планировщик 3 в 1", text: "День, неделя, месяц — одно касание, чтобы переключиться. Задачи перетекают между уровнями." },
  { icon: Dumbbell, title: "Тренировки", text: "Расписание тренировок, прогресс по нагрузке и подходам. Без лишних полей." },
  { icon: Moon, title: "Сон", text: "Отмечай время отхода и подъёма. Lumen строит линию качества сна за месяц." },
  { icon: Activity, title: "Здоровье", text: "Настроение, энергия, вода, шаги. Никакой перегруженной медицинской панели." },
  { icon: NotebookPen, title: "Дневник мыслей", text: "Запиши, что было в голове сегодня. Lumen хранит это приватно — только ты и AI." },
  { icon: Sparkles, title: "AI-инсайты", text: "Lumen читает твои данные и говорит, что мешает и что работает. Конкретно, без воды." },
];

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Background grid */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-glow" />

      {/* Header */}
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-5 pt-6 sm:px-8">
        <LumenLogo />
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <Link
            to="/auth"
            search={{ mode: "signin" }}
            className="rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Войти
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Регистрация
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-24 pt-16 sm:px-8 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground animate-soft-pulse" />
            Тёмный, тихий, твой
          </div>
          <h1 className="font-serif text-5xl leading-[1.05] tracking-tight sm:text-7xl">
            Один экран,
            <br />
            <span className="italic text-muted-foreground">чтобы вести день.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Lumen — это ежедневник, тренер и аналитик. Планируй день, неделю и месяц.
            Следи за сном и здоровьем. AI расскажет, что улучшить — без воды.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="group inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-transform hover:scale-[1.02]"
            >
              Начать бесплатно
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm text-foreground transition-colors hover:bg-accent"
            >
              Что внутри
            </a>
          </div>
        </motion.div>

        {/* Mock card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-16 max-w-3xl"
        >
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/30">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <div className="ml-3 text-xs text-muted-foreground">lumen · среда, 7 июня</div>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-3">
              {[
                { label: "Сегодня", items: ["Тренировка 18:00", "Звонок с командой", "Прочитать главу"] },
                { label: "Неделя", items: ["3 тренировки", "Закрыть проект", "Семейный ужин"] },
                { label: "Месяц", items: ["7ч сна в среднем", "12 пробежек", "Дневник 30/30"] },
              ].map((col) => (
                <div key={col.label}>
                  <div className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">{col.label}</div>
                  <ul className="space-y-2">
                    {col.items.map((t) => (
                      <li key={t} className="flex items-center gap-2 text-sm">
                        <span className="h-3.5 w-3.5 rounded-full border border-border" />
                        <span className="text-foreground/90">{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-border px-6 py-3 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              AI: ты спишь на 40 минут меньше, чем неделю назад. Сдвинь отбой на 23:30.
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <div className="mb-10 max-w-2xl">
          <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">Всё, что нужно. Ничего лишнего.</h2>
          <p className="mt-3 text-muted-foreground">Шесть инструментов в одном спокойном интерфейсе.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-colors hover:bg-surface"
            >
              <f.icon className="h-5 w-5 text-foreground" />
              <h3 className="mt-4 text-base font-medium">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* iPhone install */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <div className="flex flex-col items-start gap-6 rounded-3xl border border-border bg-card p-8 sm:flex-row sm:items-center sm:justify-between sm:p-12">
          <div className="max-w-xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              <Smartphone className="h-3.5 w-3.5" /> Работает как приложение
            </div>
            <h3 className="font-serif text-3xl tracking-tight">Добавь Lumen на iPhone</h3>
            <p className="mt-3 text-muted-foreground">Открой в Safari → «Поделиться» → «На экран Домой». Lumen откроется как нативное приложение, без браузера.</p>
          </div>
          <LumenMark size={64} className="opacity-80" />
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 text-xs text-muted-foreground sm:px-8">
          <div className="flex items-center gap-2">
            <LumenMark size={16} />
            <span>© Lumen, {new Date().getFullYear()}</span>
          </div>
          <div>Сделано спокойно.</div>
        </div>
      </footer>
    </div>
  );
}
