/** @type {import('next').NextConfig} */
const nextConfig = {
  // Redirects use the exact approved PUBLIC_ORIGIN, including loopback IPs.
  // Next's default normalization would rewrite 127.0.0.1 / ::1 to localhost.
  skipMiddlewareUrlNormalize: true,
  async rewrites() {
    // Cron downloads these after Next starts. Serve the shared volume through a
    // route instead of Next's production public-directory startup snapshot.
    return {
      beforeFiles: [
        { source: "/heroes/images/:filename", destination: "/api/heroes/assets/images/:filename" },
        { source: "/heroes/skins/:heroId/:filename", destination: "/api/heroes/assets/skins/:heroId/:filename" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};
module.exports = nextConfig;
