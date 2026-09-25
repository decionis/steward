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
  // The database layer is loaded at run time, not bundled: TypeORM resolves
  // its drivers dynamically and the embedded driver is a native module.
  serverExternalPackages: ["typeorm", "better-sqlite3"],
  // The embedded driver's native binary is built for the platform the image
  // runs on, in the Dockerfile; never carry the build machine's copy.
  outputFileTracingExcludes: {
    "*": ["./node_modules/.pnpm/better-sqlite3@*/**"],
  },
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
