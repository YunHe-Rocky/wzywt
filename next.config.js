/** @type {import('next').NextConfig} */
const nextConfig = {
  // Redirects use the exact approved PUBLIC_ORIGIN, including loopback IPs.
  // Next's default normalization would rewrite 127.0.0.1 / ::1 to localhost.
  skipMiddlewareUrlNormalize: true,
};
module.exports = nextConfig;
