import path from "node:path";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const basePath = process.env.IS_DEMO === "1" ? "/demo" : "";

const nextConfig: NextConfig = {
  ...(basePath
    ? {
        assetPrefix: "/demo-assets",
        basePath,
        redirects: async () => [
          {
            basePath: false,
            destination: basePath,
            permanent: false,
            source: "/",
          },
        ],
      }
    : {}),
  cacheComponents: true,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  experimental: {
    appNewScrollHandler: true,
    cachedNavigations: true,
    inlineCss: true,
    prefetchInlining: true,
    turbopackFileSystemCacheForDev: true,
  },
  images: {
    // Uploaded attachments are served from this app's own origin
    // (/api/files/<key>, streamed out of R2) rather than Vercel Blob's
    // public host, so the `*.public.blob.vercel-storage.com` pattern is gone;
    // a same-origin path needs no remote pattern.
    remotePatterns: [
      {
        hostname: "avatar.vercel.sh",
      },
    ],
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
    incomingRequests: false,
  },
  // Required by @opennextjs/cloudflare, which bundles `.next/standalone/**`
  // into the Worker. Trace from the monorepo root so workspace dependencies
  // resolve from the root node_modules.
  output: "standalone",
  // biome-ignore lint/correctness/noGlobalDirnameFilename: Next transpiles next.config.ts to CommonJS, where __dirname is this file's directory
  outputFileTracingRoot: path.join(__dirname, "../.."),
  poweredByHeader: false,
  reactCompiler: true,
};

// `next dev` gets the Worker's bindings — HYPERDRIVE (pointed at the local
// Postgres by wrangler.jsonc's localConnectionString), the BLOB bucket (a
// local R2 emulation) and AI (Workers AI, which has no local mode, so wrangler
// reaches it remotely: `wrangler login` first) — through
// getCloudflareContext(). In the dev server ONLY: the AI binding makes
// wrangler open a remote session, and a build must need no Cloudflare
// credential (a local or test build has none; a deploy lane's token is for
// the deploy).
// Upstream wrapped the config in `withBotId` (Vercel BotID); see lib/bot.ts.
export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    initOpenNextCloudflareForDev();
  }
  return nextConfig;
}
