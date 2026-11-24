import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets the E2E suite build into its own folder without disturbing a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack: (config) => {
    // Konva's Node entry requires the optional native "canvas" package; the browser build never needs it.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = { ...(config.resolve.alias ?? {}), canvas: false };
    return config;
  },
};

export default nextConfig;
