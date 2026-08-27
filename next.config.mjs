const supabaseHostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
const supabaseStorageHostname = "zzojrniuppueizhnmqfd.supabase.co";

/** @type {import('next').NextConfig} */
const nextConfig = {
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
        permanent: false,
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
