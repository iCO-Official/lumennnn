import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import de from "@/locales/de";
import en from "@/locales/en";
import es from "@/locales/es";
import fr from "@/locales/fr";
import pl from "@/locales/pl";
import uk from "@/locales/uk";

// The UI is written in Russian; every other language maps the Russian text to
// its translation (a missing entry falls back to Russian).
export const LANGUAGES = [
  { id: "ru", label: "Русский", locale: "ru-RU", name: "Russian" },
  { id: "en", label: "English", locale: "en-GB", name: "English" },
  { id: "de", label: "Deutsch", locale: "de-DE", name: "German" },
  { id: "pl", label: "Polski", locale: "pl-PL", name: "Polish" },
  { id: "uk", label: "Українська", locale: "uk-UA", name: "Ukrainian" },
  { id: "es", label: "Español", locale: "es-ES", name: "Spanish" },
  { id: "fr", label: "Français", locale: "fr-FR", name: "French" },
] as const;

export type Lang = (typeof LANGUAGES)[number]["id"];

const DICTS: Record<Lang, Record<string, string> | null> = { ru: null, en, de, pl, uk, es, fr };
const COOKIE = "lumen-lang";
// Languages whose speakers usually read Russian better than English.
const RUSSIAN_READERS = ["ru", "be", "kk", "ky", "uz", "tg", "hy", "az"];

function isLang(value: unknown): value is Lang {
  return typeof value === "string" && value in DICTS;
}

/** First supported language in a preference list; unknown languages get English. */
function pickLang(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLang(base)) return base;
    if (RUSSIAN_READERS.includes(base)) return "ru";
  }
  return preferred.length ? "en" : "ru";
}

function parseAcceptLanguage(header: string) {
  return header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag, q: q ? Number(q) : 1 };
    })
    .filter((item) => item.tag && item.tag !== "*")
    .sort((a, b) => b.q - a.q)
    .map((item) => item.tag);
}

let clientLang: Lang | null = null;

function readCookie(name: string) {
  return document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))?.[1];
}

function detectClientLang(): Lang {
  const saved = readCookie(COOKIE);
  if (isLang(saved)) return saved;
  return pickLang(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

/**
 * Current language: the one picked in Settings (a cookie, so the server renders
 * it too), else the device / browser language (Accept-Language on the server).
 */
export const getLang = createIsomorphicFn()
  .server((): Lang => {
    try {
      const saved = getCookie(COOKIE);
      if (isLang(saved)) return saved;
      return pickLang(parseAcceptLanguage(getRequestHeader("accept-language") ?? ""));
    } catch {
      return "ru"; // outside a request (module init)
    }
  })
  .client((): Lang => (clientLang ??= detectClientLang()));

/** Whether the language was picked by hand (vs. following the device). */
export function isLangManual() {
  return isLang(readCookie(COOKIE));
}

/** Switches the language ("auto" = follow the device) and reloads, so every screen re-renders. */
export function setLang(lang: Lang | "auto") {
  document.cookie =
    lang === "auto"
      ? `${COOKIE}=; path=/; max-age=0; samesite=lax`
      : `${COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}

/** BCP 47 locale for dates and numbers. */
export function getLocale() {
  const lang = getLang();
  return LANGUAGES.find((item) => item.id === lang)?.locale ?? "ru-RU";
}

/** English name of the current language (for AI prompts). */
export function getLangName() {
  const lang = getLang();
  return LANGUAGES.find((item) => item.id === lang)?.name ?? "Russian";
}

/** Translates Russian UI text; `{name}` placeholders are filled from `vars`. */
export function tr(text: string, vars?: Record<string, string | number>) {
  const out = DICTS[getLang()]?.[text] ?? text;
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}
