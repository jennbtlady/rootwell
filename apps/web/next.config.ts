import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (the Next 16 default from create-next-app) requires every cookie
  // or database read to sit inside a Suspense boundary and streams auth redirects.
  // A signed-in CRM has no public pages worth prerendering, so the classic dynamic
  // rendering model is simpler and boring. Revisit if a marketing site joins this app.
  cacheComponents: false,
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
