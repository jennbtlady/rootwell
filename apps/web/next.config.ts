import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Workspace packages ship TypeScript source, so Next compiles them.
  transpilePackages: ["@maple/api", "@maple/core", "@maple/db"],
  // The Postgres driver must stay a real Node module, not a bundled one.
  serverExternalPackages: ["postgres"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
