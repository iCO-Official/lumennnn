import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "@/integrations/supabase/client";
import { LumenLogo } from "@/components/lumen-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Calendar,
  NotebookPen,
  Sparkles,
  CalendarClock,
  Settings as SettingsIcon,
  Home,
} from "lucide-react";
import {
  PlansSection as PlannerPlansSection,
  RoutinesSection as PlannerRoutinesSection,
} from "@/components/planner-sections";
import { LumenAiChat } from "@/components/lumen-ai-chat";
import { HomeSection, greeting, todayLabel, type Section } from "@/components/app/home";
import { JournalSection, SleepSection } from "@/components/app/journal";
import { MetricsSection } from "@/components/app/metrics";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Lumen — твой день" }] }),
  component: AppPage,
});

const SECTIONS: {
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "home", label: "Сегодня", icon: Home },
  { id: "plans", label: "Планы", icon: Calendar },
  { id: "routine", label: "Рутины", icon: CalendarClock },
  { id: "journal", label: "Дневник", icon: NotebookPen },
  { id: "ai", label: "AI", icon: Sparkles },
];

function AppPage() {
  const [section, setSection] = useState<Section>("home");
  const [name, setName] = useState("");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", u.user.id)
        .maybeSingle();
      setName(
        data?.display_name || u.user.user_metadata?.name || u.user.email?.split("@")[0] || "",
      );
    })();
  }, []);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-glow" />

      {section !== "ai" && (
        <header className="relative z-10 mx-auto flex max-w-4xl items-center justify-between px-5 pt-2 sm:px-8 sm:pt-4">
          <LumenLogo />
          <div className="flex items-center gap-2">
            <ThemeToggle className="!h-11 !w-11" />
            <Link
              to="/app/settings"
              aria-label="Настройки"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/40 backdrop-blur transition-colors hover:bg-accent active:scale-95"
            >
              <SettingsIcon className="h-5 w-5" />
            </Link>
          </div>
        </header>
      )}

      <main
        className={`relative z-10 mx-auto max-w-4xl ${section === "ai" ? "" : "px-5 pb-36 pt-3 sm:px-8 sm:pt-6"}`}
      >
        {section !== "ai" && (
          <div className="mb-5">
            <div className="text-sm text-muted-foreground">
              <span translate="no">{greeting()}</span>
              {name ? ", " + name : ""}.
            </div>
            <h1 className="mt-1 font-serif text-2xl tracking-tight sm:text-3xl">
              <span translate="no">{todayLabel()}</span>
            </h1>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {section === "home" && <HomeSection onGo={setSection} />}
            {section === "plans" && <PlannerPlansSection />}
            {section === "routine" && <PlannerRoutinesSection />}
            {section === "journal" && <JournalSection />}
            {section === "sleep" && <SleepSection />}
            {section === "metrics" && <MetricsSection />}
            {section === "ai" && <LumenAiChat />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-stretch justify-between px-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                aria-label={s.label}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`relative inline-flex h-8 w-full max-w-12 items-center justify-center rounded-xl ${active ? "bg-accent" : ""}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="truncate text-[10px] font-medium leading-none">{s.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ============= HOME =============
