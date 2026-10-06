import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LumenLogo } from "@/components/lumen-logo";
import {
  Calendar,
  NotebookPen,
  Sparkles,
  Settings as SettingsIcon,
  Home,
  Plus,
  Moon,
  Ruler,
  LayoutGrid,
} from "lucide-react";
import { PlansSection as PlannerPlansSection, TaskEditor } from "@/components/planner-sections";
import { AppSheet } from "@/components/ui/app-sheet";
import { localIso } from "@/lib/planner";
import { HomeSection, greeting, todayLabel, type Section } from "@/components/app/home";
import { tr } from "@/lib/i18n";

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
const SettingsView = lazy(() =>
  import("@/components/app/settings").then((m) => ({ default: m.SettingsView })),
);
const MetricsSection = lazy(() =>
  import("@/components/app/metrics").then((m) => ({ default: m.MetricsSection })),
);

const WIDE = "(min-width: 1280px)";
const isWide = () => typeof window !== "undefined" && window.matchMedia(WIDE).matches;

function SideItem({
  icon: Icon,
  label,
  hint,
  active,
  onClick,
  className = "",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      } ${className}`}
    >
      <Icon className="h-[18px] w-[18px]" />
      {label}
      {hint && <kbd className="ml-auto font-sans text-[11px] text-muted-foreground/60">{hint}</kbd>}
    </button>
  );
}

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: tr("Lumen — твой день") }] }),
  component: AppPage,
});

const SECTIONS: {
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "home", label: tr("Сегодня"), icon: Home },
  { id: "plans", label: tr("Планы"), icon: Calendar },
  { id: "journal", label: tr("Дневник"), icon: NotebookPen },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "settings", label: tr("Настройки"), icon: SettingsIcon },
];

// Tab order, so switching slides in the direction of the tapped tab.
const ORDER: Record<Section, number> = {
  home: 0,
  sleep: 0.5,
  metrics: 0.5,
  plans: 1,
  journal: 2,
  ai: 3,
  settings: 4,
};

function AppPage() {
  const [[section, direction], setPage] = useState<[Section, number]>(["home", 0]);
  // Visited tabs stay mounted (like a native tab bar): switching back is instant,
  // with no reload or "Загрузка…" flash.
  const [visited, setVisited] = useState<Section[]>(() => (isWide() ? ["home", "ai"] : ["home"]));
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const sectionRef = useRef(section);
  sectionRef.current = section;
  // Stable identity, so the memoized tab views below never re-render on tab switches.
  const setSection = useCallback((next: Section) => {
    const current = sectionRef.current;
    if (next === "ai" && isWide()) {
      // Wide screens: the chat is always open on the right; just jump into it.
      document.querySelector<HTMLTextAreaElement>("[data-ai-chat] textarea")?.focus();
      return;
    }
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
      settings: <SettingsView />,
      journal: <JournalSection />,
      sleep: <SleepSection />,
      metrics: <MetricsSection />,
      ai: <LumenAiChat />,
    }),
    [setSection],
  );

  // Slide a finger along the tab bar to switch tabs (like Telegram).
  const dragRef = useRef<{
    x: number;
    lastX: number;
    lastT: number;
    dragging: boolean;
    suppressClick: boolean;
  } | null>(null);
  // While dragging, the highlight follows the finger and stretches with its speed.
  const [pill, setPill] = useState<{ x: number; stretch: number } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navDrag = useMemo(() => {
    const geometry = (el: HTMLElement, clientX: number) => {
      const rect = el.getBoundingClientRect();
      const tab = (rect.width - 16) / SECTIONS.length;
      const offset = clientX - rect.left - 8;
      const i = Math.min(SECTIONS.length - 1, Math.max(0, Math.floor(offset / tab)));
      const x = Math.min(tab * (SECTIONS.length - 1), Math.max(0, offset - tab / 2));
      return { id: SECTIONS[i].id, x };
    };
    return {
      down(e: React.PointerEvent<HTMLDivElement>) {
        const now = performance.now();
        dragRef.current = {
          x: e.clientX,
          lastX: e.clientX,
          lastT: now,
          dragging: false,
          suppressClick: false,
        };
      },
      move(e: React.PointerEvent<HTMLDivElement>) {
        const d = dragRef.current;
        if (!d) return;
        if (!d.dragging && Math.abs(e.clientX - d.x) < 8) return;
        if (!d.dragging) {
          d.dragging = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        const now = performance.now();
        const speed = Math.abs(e.clientX - d.lastX) / Math.max(1, now - d.lastT); // px/ms
        d.lastX = e.clientX;
        d.lastT = now;
        const { id, x } = geometry(e.currentTarget, e.clientX);
        setPill({ x, stretch: 1 + Math.min(0.6, speed * 0.45) });
        clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => setPill((p) => p && { ...p, stretch: 1 }), 90);
        if (id !== sectionRef.current) setSection(id);
      },
      up() {
        const d = dragRef.current;
        clearTimeout(settleTimer.current);
        setPill(null);
        dragRef.current = d?.dragging ? { ...d, suppressClick: true } : null;
      },
      consumeClick() {
        const suppress = !!dragRef.current?.suppressClick;
        dragRef.current = null;
        return suppress;
      },
    };
  }, [setSection]);

  // iOS: when the keyboard opens, Safari scrolls the page up and, especially in
  // the home-screen app, often doesn't fully undo it after the keyboard closes:
  // the page stays scrolled, or the layout viewport stays short and every fixed
  // element (the tab bar, the AI chat) floats above the bottom edge.
  // 1) scroll back once the keyboard is gone (retried — iOS ignores early calls);
  // 2) publish any leftover gap as --vv-gap, which the tab bar and chat cover.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const typing = () =>
      !!document.activeElement?.matches?.("input, textarea, select, [contenteditable]");
    const measure = () => {
      const gap = typing() ? 0 : Math.round(vv.height + vv.offsetTop - window.innerHeight);
      root.style.setProperty("--vv-gap", `${gap > 1 ? gap : 0}px`);
    };
    const restore = () => {
      if (typing()) return;
      const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
      if (window.scrollY > maxScroll || vv.offsetTop > 0)
        window.scrollTo(0, Math.min(window.scrollY, maxScroll));
      measure();
    };
    let timers: ReturnType<typeof setTimeout>[] = [];
    const settle = () => {
      timers.forEach(clearTimeout);
      timers = [50, 250, 500, 900].map((ms) => setTimeout(restore, ms));
    };
    let lastHeight = vv.height;
    const onResize = () => {
      if (vv.height > lastHeight + 80) settle(); // keyboard closed
      lastHeight = vv.height;
      measure();
    };
    const onFocusOut = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.matches?.("input, textarea, select, [contenteditable]")) settle();
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", measure);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("pageshow", settle);
    measure();
    return () => {
      timers.forEach(clearTimeout);
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", measure);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("pageshow", settle);
    };
  }, []);

  // Growing the window to wide while on the AI tab: the chat docks, show Home.
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const onChange = () => {
      if (query.matches && sectionRef.current === "ai") setPage(["home", 0]);
      if (query.matches) setVisited((list) => (list.includes("ai") ? list : [...list, "ai"]));
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Desktop: keys 1–5 switch tabs (ignored while typing or with modifiers).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el?.matches?.("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "n" || e.key === "N" || e.key === "т" || e.key === "Т") {
        e.preventDefault();
        setAdding(true);
        return;
      }
      const target = SECTIONS[Number(e.key) - 1];
      if (target) setSection(target.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSection]);

  // Publish the real tab bar height as --nav-h (the AI chat sits right above it).
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () =>
      document.documentElement.style.setProperty("--nav-h", `${nav.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  // Warm up the main tabs in the background so even the first switch is instant.
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisited((list) => [
        ...list,
        ...(["plans", "journal", "ai", "settings"] as Section[]).filter((id) => !list.includes(id)),
      ]);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? "");
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
    <div className="relative min-h-app bg-background text-foreground md:pl-60 xl:pr-[400px]">
      {/* Computer: a sidebar instead of the bottom tab bar. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-background px-3 py-6 md:flex">
        <div className="px-3 pb-6">
          <LumenLogo />
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mb-5 flex h-11 items-center gap-2 rounded-xl bg-foreground px-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {tr("Новое дело")}
          <kbd className="ml-auto font-sans text-[11px] opacity-50">N</kbd>
        </button>
        <nav className="flex flex-col gap-1">
          {SECTIONS.map((s, i) => (
            <SideItem
              key={s.id}
              icon={s.icon}
              label={s.label}
              hint={String(i + 1)}
              active={section === s.id}
              onClick={() => setSection(s.id)}
              // The chat is docked on the right on wide screens.
              className={s.id === "ai" ? "xl:hidden" : ""}
            />
          ))}
        </nav>
        <p className="mb-1 mt-6 px-3 text-[11px] uppercase tracking-widest text-muted-foreground/70">
          {tr("Ещё")}
        </p>
        <nav className="flex flex-col gap-1">
          <SideItem
            icon={Moon}
            label={tr("Сон")}
            active={section === "sleep"}
            onClick={() => setSection("sleep")}
          />
          <SideItem
            icon={Ruler}
            label={tr("Метрики")}
            active={section === "metrics"}
            onClick={() => setSection("metrics")}
          />
          <Link
            to="/app/more"
            className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <LayoutGrid className="h-[18px] w-[18px]" />
            {tr("Тренировки и другое")}
          </Link>
        </nav>
        <button
          type="button"
          onClick={() => setSection("settings")}
          className="mt-auto flex items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-accent/60"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground font-serif text-base text-background">
            {(name || email || "?").trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm">{name || tr("Без имени")}</span>
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </span>
        </button>
      </aside>

      <AppSheet open={adding} onClose={() => setAdding(false)}>
        <TaskEditor
          task={null}
          editAllFuture={false}
          defaultDate={localIso()}
          onClose={() => setAdding(false)}
          onSaved={() => setAdding(false)}
        />
      </AppSheet>

      {section !== "ai" && (
        <header className="relative z-10 mx-auto flex h-14 max-w-4xl items-center px-5 pt-2 sm:px-8 sm:pt-4 md:hidden">
          <LumenLogo />
        </header>
      )}

      <main
        className={`relative z-10 mx-auto max-w-4xl lg:max-w-5xl ${section === "ai" ? "" : "px-5 pb-36 pt-3 sm:px-8 sm:pt-6 md:pb-16 md:pt-10"}`}
      >
        {section !== "ai" && section !== "settings" && (
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
            className={
              id === "ai"
                ? section === "ai"
                  ? "tab-fade"
                  : "hidden xl:block" // docked on the right on wide screens
                : id !== section
                  ? "hidden"
                  : "tab-enter"
            }
            style={{ "--tab-dir": direction } as React.CSSProperties}
          >
            <Suspense fallback={null}>{views[id]}</Suspense>
          </div>
        ))}
      </main>

      {/* Bottom navigation */}
      <nav
        ref={navRef}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[max(6px,calc(env(safe-area-inset-bottom)-14px))] md:hidden"
        style={{ transform: "translateY(var(--vv-gap, 0px))" }}
      >
        <div
          className="relative mx-auto flex max-w-4xl touch-none items-stretch justify-between px-2"
          onPointerDown={navDrag.down}
          onPointerMove={navDrag.move}
          onPointerUp={navDrag.up}
          onPointerCancel={navDrag.up}
        >
          {/* One highlight, moved with CSS transforms (compositor-only). Follows the finger
              while dragging and stretches with its speed, then springs onto the tab. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-1.5 h-11"
            style={{
              left: "0.5rem",
              width: `calc((100% - 1rem) / ${SECTIONS.length})`,
              transform: pill
                ? `translateX(${pill.x}px) scale(${pill.stretch}, 1.08)`
                : `translateX(${
                    Math.max(
                      0,
                      SECTIONS.findIndex((s) => s.id === section),
                    ) * 100
                  }%)`,
              transition: pill
                ? "transform 90ms linear"
                : "transform 420ms cubic-bezier(0.34, 1.45, 0.5, 1)",
              opacity: SECTIONS.some((s) => s.id === section) ? 1 : 0,
            }}
          >
            <span className="mx-auto block h-full w-full max-w-[60px] rounded-2xl bg-accent" />
          </span>
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => (navDrag.consumeClick() ? undefined : setSection(s.id))}
                aria-label={s.label}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 pb-1 pt-1.5 transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <span className="inline-flex h-11 w-full max-w-[60px] items-center justify-center">
                  <Icon className="h-[26px] w-[26px]" />
                </span>
                <span className="truncate text-[11px] font-medium leading-none">{s.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ============= HOME =============
