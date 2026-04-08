/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["apify-client", "proxy-agent"],
  },
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
    ],
  },
  reactStrictMode: false,
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
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
};

export default nextConfig;
