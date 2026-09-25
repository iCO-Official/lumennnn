import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Publishable (safe for the browser) backend config. Used as a fallback when
// VITE_SUPABASE_* are not set in .env / the hosting environment.
const SUPABASE_URL = "https://gmpjofmjibecusdcggyg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtcGpvZm1qaWJlY3VzZGNnZ3lnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NjM4MDUsImV4cCI6MjA5NjQzOTgwNX0.WyXxwwjJqyIC3u91kVED4lMogTsNLF5-uKnkQ6J2O1k";
const SUPABASE_PROJECT_ID = "gmpjofmjibecusdcggyg";

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };

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
