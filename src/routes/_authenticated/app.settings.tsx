import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SettingsView } from "@/components/app/settings";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Настройки — Lumen" }] }),
  component: SettingsPage,
});

// Settings now live in the tab bar; this page keeps old links working.
function SettingsPage() {
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
      <main className="relative z-10 px-5 pb-24 pt-4 sm:px-8">
        <SettingsView />
      </main>
    </div>
  );
}
