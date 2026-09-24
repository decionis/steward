import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const discoveryHeaders = [{ key: "X-Robots-Tag", value: "all" }];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Later entries override earlier ones for the same header key. The
      // operator console stays out of search indexes; the description of it,
      // the machine-discovery files, does not.
      { source: "/llms.txt", headers: discoveryHeaders },
      { source: "/llms-full.txt", headers: discoveryHeaders },
    ];
  },
};

export default nextConfig;
