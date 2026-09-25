import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { HomeSection, greeting, todayLabel, type Section } from "@/components/app/home";

// Heavier tabs (markdown renderer, charts) load in the background, off the startup path.
const LumenAiChat = lazy(() =>
  import("@/components/lumen-ai-chat").then((m) => ({ default: m.LumenAiChat })),
);
const JournalSection = lazy(() =>
  import("@/components/app/journal").then((m) => ({ default: m.JournalSection })),
);
const SleepSection = lazy(() =>
  import("@/components/app/journal").then((m) => ({ default: m.SleepSection })),
);
const MetricsSection = lazy(() =>
  import("@/components/app/metrics").then((m) => ({ default: m.MetricsSection })),
);

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

// Tab order, so switching slides in the direction of the tapped tab.
const ORDER: Record<Section, number> = {
  home: 0,
  sleep: 0.5,
  metrics: 0.5,
  plans: 1,
  routine: 2,
  journal: 3,
  ai: 4,
};

function AppPage() {
  const [[section, direction], setPage] = useState<[Section, number]>(["home", 0]);
  // Visited tabs stay mounted (like a native tab bar): switching back is instant,
  // with no reload or "Загрузка…" flash.
  const [visited, setVisited] = useState<Section[]>(["home"]);
  const [name, setName] = useState("");

  const sectionRef = useRef(section);
  sectionRef.current = section;
  // Stable identity, so the memoized tab views below never re-render on tab switches.
  const setSection = useCallback((next: Section) => {
    const current = sectionRef.current;
    if (next === current) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setPage([next, Math.sign(ORDER[next] - ORDER[current])]);
    setVisited((list) => (list.includes(next) ? list : [...list, next]));
    window.scrollTo({ top: 0 });
  }, []);

  // Created once: React skips re-rendering an element it has already seen, so
  // switching tabs only toggles visibility instead of re-rendering every tab.
  const views = useMemo<Record<Section, React.ReactNode>>(
    () => ({
      home: <HomeSection onGo={setSection} />,
      plans: <PlannerPlansSection />,
      routine: <PlannerRoutinesSection />,
      journal: <JournalSection />,
      sleep: <SleepSection />,
      metrics: <MetricsSection />,
      ai: <LumenAiChat />,
    }),
    [setSection],
  );

  // Slide a finger along the tab bar to switch tabs (like Telegram).
  const dragRef = useRef<{ x: number; dragging: boolean; suppressClick: boolean } | null>(null);
  const navDrag = useMemo(() => {
    const tabAt = (el: HTMLElement, clientX: number) => {
      const rect = el.getBoundingClientRect();
      const inner = rect.width - 16;
      const i = Math.floor(((clientX - rect.left - 8) / inner) * SECTIONS.length);
      return SECTIONS[Math.min(SECTIONS.length - 1, Math.max(0, i))].id;
    };
    return {
      down(e: React.PointerEvent<HTMLDivElement>) {
        dragRef.current = { x: e.clientX, dragging: false, suppressClick: false };
      },
      move(e: React.PointerEvent<HTMLDivElement>) {
        const d = dragRef.current;
        if (!d) return;
        if (!d.dragging && Math.abs(e.clientX - d.x) < 8) return;
        if (!d.dragging) {
          d.dragging = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        const id = tabAt(e.currentTarget, e.clientX);
        if (id !== sectionRef.current) setSection(id);
      },
      up() {
        const d = dragRef.current;
        dragRef.current = d?.dragging ? { ...d, suppressClick: true } : null;
      },
      consumeClick() {
        const suppress = !!dragRef.current?.suppressClick;
        dragRef.current = null;
        return suppress;
      },
    };
  }, [setSection]);

  // Warm up the main tabs in the background so even the first switch is instant.
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisited((list) => [
        ...list,
        ...(["plans", "routine", "journal", "ai"] as Section[]).filter((id) => !list.includes(id)),
      ]);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

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
      {section !== "ai" && (
        <header className="relative z-10 mx-auto flex max-w-4xl items-center justify-between px-5 pt-2 sm:px-8 sm:pt-4">
          <LumenLogo />
          <div className="flex items-center gap-2">
            <ThemeToggle className="!h-11 !w-11" />
            <Link
              to="/app/settings"
              aria-label="Настройки"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-card transition-colors hover:bg-accent"
            >
              <SettingsIcon className="h-4 w-4" />
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

        {visited.map((id) => (
          <div
            key={id}
            // Re-shown tabs replay the CSS enter animation (GPU: opacity + transform).
            // The AI chat is position:fixed, so it only fades (a transform would re-anchor it).
            className={id !== section ? "hidden" : id === "ai" ? "tab-fade" : "tab-enter"}
            style={{ "--tab-dir": direction } as React.CSSProperties}
          >
            <Suspense fallback={null}>{views[id]}</Suspense>
          </div>
        ))}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)]">
        <div
          className="relative mx-auto flex max-w-4xl touch-none items-stretch justify-between px-2"
          onPointerDown={navDrag.down}
          onPointerMove={navDrag.move}
          onPointerUp={navDrag.up}
          onPointerCancel={navDrag.up}
        >
          {/* One highlight that slides between tabs with a CSS transform (compositor-only). */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-2.5 h-8 transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
            style={{
              left: "0.5rem",
              width: `calc((100% - 1rem) / ${SECTIONS.length})`,
              transform: `translateX(${
                Math.max(
                  0,
                  SECTIONS.findIndex((s) => s.id === section),
                ) * 100
              }%)`,
              opacity: SECTIONS.some((s) => s.id === section) ? 1 : 0,
            }}
          >
            <span className="mx-auto block h-full w-full max-w-12 rounded-xl bg-accent" />
          </span>
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => (navDrag.consumeClick() ? undefined : setSection(s.id))}
                aria-label={s.label}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <span className="inline-flex h-8 w-full max-w-12 items-center justify-center">
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
