import { defineConfig } from "vite";
import path from "path";

const rawPort = process.env.PORT || "3000";
const port = Number(rawPort) > 0 ? Number(rawPort) : 3000;

const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const defaultBasePath = repoName ? `/${repoName}/` : "/";
const basePath = process.env.BASE_PATH || defaultBasePath;

const host = process.env.HOST || "localhost";
const allowedHosts = process.env.ALLOWED_HOSTS
  ? process.env.ALLOWED_HOSTS.split(",").map((h) => h.trim()).filter(Boolean)
  : undefined;

export default defineConfig({
  base: basePath,
  plugins: [
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host,
    ...(allowedHosts ? { allowedHosts } : {}),
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host,
    ...(allowedHosts ? { allowedHosts } : {}),
  },
});
