import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";
import { tr } from "@/lib/i18n";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={tr("Переключить тему")}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-card transition-colors hover:bg-accent ${className}`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
