import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LumenLogo } from "@/components/lumen-logo";
import { WorkoutsSection, HealthSection } from "@/components/app/activity";
import { MetricsSection } from "@/components/app/metrics";
import { GamingSection } from "@/components/app/gaming";
import { StatsSection } from "@/components/app/stats";

export const Route = createFileRoute("/_authenticated/app/more")({
  head: () => ({ meta: [{ title: "Ещё — Lumen" }] }),
  component: MorePage,
});

const TABS = [
  { id: "workouts", label: "Тренировки", component: WorkoutsSection },
  { id: "health", label: "Здоровье", component: HealthSection },
  { id: "metrics", label: "Метрики", component: MetricsSection },
  { id: "gaming", label: "Игры", component: GamingSection },
  { id: "stats", label: "Статистика", component: StatsSection },
] as const;

type Tab = (typeof TABS)[number]["id"];

function MorePage() {
  const [tab, setTab] = useState<Tab>("workouts");
  const Active = TABS.find((t) => t.id === tab)!.component;

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
      <header className="relative z-10 mx-auto flex max-w-4xl items-center justify-between px-5 pt-3 sm:px-8 sm:pt-4">
        <Link
          to="/app"
          aria-label="Назад"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/40 backdrop-blur"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <LumenLogo />
        <div className="w-9" />
      </header>

      <main className="relative z-10 mx-auto max-w-4xl px-5 pb-32 pt-6 sm:px-8">
        <h1 className="mb-4 font-serif text-3xl tracking-tight">Ещё</h1>
        <div className="-mx-5 mb-6 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`h-10 shrink-0 rounded-full border px-4 text-sm transition-colors ${
                tab === t.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Active />
      </main>
    </div>
  );
}
