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
  async headers() {
    // Framing. No other site may show a page of this app inside a frame, which stops
    // clickjacking: a hidden frame of a signed-in screen under a decoy page. The CSP rule is
    // the modern one; X-Frame-Options covers older browsers. The one exception is the public
    // giving pages, /give/*, which nonprofits embed on their own websites with /embed.js
    // (fundraising Phase 1). A later rule can override a header but not remove one, so the
    // "no framing" rules skip /give/ by regex rather than being overridden there.
    const noFraming = [
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Frame-Options", value: "DENY" },
    ];
    return [
      // Everywhere (launch review, "soon after"): no MIME sniffing, no full URLs sent to other
      // sites, no camera, microphone or location, and HTTPS only once a browser has seen it.
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      { source: "/", headers: noFraming },
      { source: "/:path((?!give/).*)", headers: noFraming },
      { source: "/give/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }] },
    ];
  },
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
