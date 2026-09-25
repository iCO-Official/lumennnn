import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Publishable (safe for the browser) backend config. Used as a fallback when
// VITE_SUPABASE_* are not set in .env / the hosting environment.
const SUPABASE_URL = "https://hdzoutvrzblwhyfcoqwp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_SBPAycFoZT9zEDIdjr5NPQ_NQRtPxSC";
const SUPABASE_PROJECT_ID = "hdzoutvrzblwhyfcoqwp";

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  // Absolute site URL for link previews (og:image). Vercel sets
  // VERCEL_PROJECT_PRODUCTION_URL at build time; VITE_SITE_URL overrides it.
  const siteUrl =
    env.VITE_SITE_URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "");

  return {
    server: { host: "::", port: 8080 },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(env.VITE_SUPABASE_URL || SUPABASE_URL),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        env.VITE_SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY,
      ),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
        env.VITE_SUPABASE_PROJECT_ID || SUPABASE_PROJECT_ID,
      ),
      "import.meta.env.VITE_SITE_URL": JSON.stringify(siteUrl.replace(/\/$/, "")),
      // Shown in Settings → Приложение: build date + commit (set by Vercel at build time).
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(
        [
          new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
          (env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7),
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    },
    css: { transformer: "lightningcss" },
    resolve: {
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
        server: { entry: "server" },
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
      // Nitro picks the deploy target automatically (Vercel, Netlify, Cloudflare, ...)
      // and falls back to a plain Node server. Override with NITRO_PRESET if needed.
      ...(command === "build" ? [nitro()] : []),
      viteReact(),
    ],
  };
});
