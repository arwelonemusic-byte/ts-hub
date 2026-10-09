import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev database (PGlite) loads its WASM and data files at runtime; bundling breaks that.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Past and upcoming ops share one feed now.
  async redirects() {
    return [
      { source: "/events/past", destination: "/events", permanent: false },
    ];
  },
  images: {
    // Discord avatars in the header.
    remotePatterns: [{ protocol: "https", hostname: "cdn.discordapp.com", pathname: "/avatars/**" }],
  },
};

export default nextConfig;
