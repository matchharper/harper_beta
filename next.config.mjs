import { realpathSync } from "node:fs";
import path from "node:path";
import { assertLocalStack } from "./scripts/localE2e/isolation.mjs";
assertLocalStack();
const supabaseHostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
const supabaseStorageHostname = "zzojrniuppueizhnmqfd.supabase.co";

// Trace package assets through their real directories so pnpm symlink aliases
// do not produce conflicting directory entries in Vercel function packages.
const packageAsset = (packageName, asset) =>
  `./${path.relative(process.cwd(), realpathSync(`node_modules/${packageName}`)).split(path.sep).join("/")}/${asset}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Inline the same real package paths used by tracing. Serverless bundles do
  // not necessarily preserve pnpm's top-level node_modules symlinks.
  env: {
    HARPER_RESUME_FONT_DIRECTORY: packageAsset("@fontsource/noto-sans-kr", ""),
    HARPER_RESUME_SCRIPT_PATH: packageAsset("pagedjs", "dist/paged.min.js"),
  },
  serverExternalPackages: [
    "playwright-core",
    "pdf-parse-fork",
    "pdf-parse",
    "@fontsource/noto-sans-kr",
  ],
  // Private local checkpoints must never be packaged into deployed functions.
  outputFileTracingExcludes: { "/*": ["./.local/career-reset/**"] },
  outputFileTracingIncludes: {
    "/*": ["./src/lib/career/simulation/applicationStagehand/*.mjs", "./src/lib/career/simulation/applicationStagehand/*.cjs", "./src/lib/career/simulation/applicationStagehand/package*.json"],
    "/api/resume-assets/*": [
      packageAsset("pagedjs", "dist/paged.min.js"),
      packageAsset("@fontsource/noto-sans-kr", "400.css"),
      packageAsset("@fontsource/noto-sans-kr", "700.css"),
      packageAsset("@fontsource/noto-sans-kr", "files/*-400-normal.woff2"),
      packageAsset("@fontsource/noto-sans-kr", "files/*-700-normal.woff2"),
    ],
    "/api/{talent/documents/*/pdf,org/generated-resume,talent/simulation,talent/chat,queues/process-application-browser,queues/process-email,internal/email/dispatch}": [
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
      {
        source: "/career/chat",
        destination: "/career",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
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
