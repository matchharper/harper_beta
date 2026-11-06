import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { assertLocalStack } from "./scripts/localE2e/isolation.mjs";
import { prepareResumeAssets } from "./scripts/prepareResumeAssets.mjs";
assertLocalStack();
await prepareResumeAssets();
const supabaseHostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
const supabaseStorageHostname = "zzojrniuppueizhnmqfd.supabase.co";

// Trace package assets through their real directories so pnpm symlink aliases
// do not produce conflicting directory entries in Vercel function packages.
const packageAsset = (packageName, asset) =>
  `./${path.relative(process.cwd(), realpathSync(`node_modules/${packageName}`)).split(path.sep).join("/")}/${asset}`;
const configRequire = createRequire(import.meta.url);
const pdfRequire = createRequire(configRequire.resolve("pdf-parse"));
const pdfJsDirectory = path.dirname(pdfRequire.resolve("pdfjs-dist/package.json"));
const pdfJsAsset = (asset) =>
  `./${path.relative(process.cwd(), pdfJsDirectory).split(path.sep).join("/")}/${asset}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
  },
  webpack(config, { dev }) {
    // The restored compiler cache exceeds the Vercel build container's memory.
    if (!dev) config.cache = false;
    return config;
  },
  // Inline the same real package paths used by tracing. Serverless bundles do
  // not necessarily preserve pnpm's top-level node_modules symlinks.
  env: {
    HARPER_RESUME_FONT_DIRECTORY: packageAsset("@fontsource/noto-sans-kr", ""),
    HARPER_RESUME_SCRIPT_PATH: packageAsset("pagedjs", "dist/paged.min.js"),
    HARPER_PDFJS_CMAP_DIRECTORY: pdfJsAsset("cmaps"),
    HARPER_PDFJS_FONT_DIRECTORY: pdfJsAsset("standard_fonts"),
  },
  serverExternalPackages: [
    "playwright-core",
    "pdf-parse-fork",
    "pdf-parse",
    "@fontsource/noto-sans-kr",
  ],
  // Private local checkpoints must never be packaged into deployed functions.
  outputFileTracingExcludes: { "/*": ["./.local/career-reset/**", "./.local/resume-parser-audit-*/**", "./.local/resume-reprocess-*/**"] },
  outputFileTracingIncludes: {
    "/*": ["./src/lib/career/simulation/applicationStagehand/*.mjs", "./src/lib/career/simulation/applicationStagehand/*.cjs", "./src/lib/career/simulation/applicationStagehand/package*.json"],
    "/api/{talent/documents/upload,talent/resume/*,internal/career/email-onboarding/ingest-profile,internal/company-talent-requests/ingest-resume,org/agent/role-creation/extract-file,internal/org-agent/slack-turn,queues/process-slack-turn}": [
      packageAsset("pdf-parse", "dist/worker/pdf.worker.mjs"),
      pdfJsAsset("cmaps/**"),
      pdfJsAsset("standard_fonts/**"),
    ],
    "/api/resume-assets/*": [
      packageAsset("pagedjs", "dist/paged.min.js"),
      packageAsset("@fontsource/noto-sans-kr", "400.css"),
      packageAsset("@fontsource/noto-sans-kr", "700.css"),
      packageAsset("@fontsource/noto-sans-kr", "files/*-400-normal.woff2"),
      packageAsset("@fontsource/noto-sans-kr", "files/*-700-normal.woff2"),
    ],
    "/api/{talent/documents/*/pdf,org/generated-resume,talent/simulation,talent/chat,queues/process-career-agent-reply,queues/process-application-browser,queues/process-email,internal/email/dispatch}": [
      packageAsset("pagedjs", "dist/paged.min.js"),
      packageAsset("pdf-parse", "dist/worker/pdf.worker.mjs"),
      packageAsset("@fontsource/noto-sans-kr", "400.css"),
      packageAsset("@fontsource/noto-sans-kr", "700.css"),
      packageAsset("@fontsource/noto-sans-kr", "files/*-400-normal.woff2"),
      packageAsset("@fontsource/noto-sans-kr", "files/*-700-normal.woff2"),
    ],
  },
  ...(process.env.HARPER_LOCAL_E2E === "1" ? {
    typescript: { tsconfigPath: ".local/full-stack/tsconfig.json" },
  } : {}),
  distDir: process.env.HARPER_E2E_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      // Google auth avatar
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // GitHub avatars (global)
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      // LinkedIn media CDN (Apify-scraped profile avatars)
      { protocol: "https", hostname: "media.licdn.com" },
      { protocol: "https", hostname: "static.licdn.com" },
      // Scholar / Google user content (paper & profile assets)
      { protocol: "https", hostname: "scholar.google.com" },
      { protocol: "https", hostname: "scholar.googleusercontent.com" },
      // Supabase public storage (company logos, resumes, etc.)
      {
        protocol: "https",
        hostname: supabaseHostname,
        pathname: "/storage/v1/object/public/**",
      },
      // Supabase public storage assets still use the project ref host when auth
      // is served through a custom domain.
      {
        protocol: "https",
        hostname: supabaseStorageHostname,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  reactStrictMode: false,
  async redirects() {
    return [
      {
        source: "/search",
        destination: "/company",
        permanent: true,
      },
      {
        source: "/invitation",
        destination: "/",
        permanent: false,
      },
      {
        source: "/invitation/:path*",
        destination: "/",
        permanent: false,
      },
      {
        source: "/career/home",
        destination: "/career",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/resume-assets/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(self), geolocation=(), browsing-topics=()",
          },
        ],
      },
      {
        // Mail button links carry a one-time token in the path.
        source: "/email-action/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
