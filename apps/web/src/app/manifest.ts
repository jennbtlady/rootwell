import type { MetadataRoute } from "next";

// Makes the web app installable on a phone home screen (PWA). See build plan 1.1.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Maple Ledger",
    short_name: "Maple",
    description: "A simple donor database for small nonprofits.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7a3b2e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
