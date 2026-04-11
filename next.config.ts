import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  // GLPK.js is a WASM module — must NOT be bundled by Turbopack
  serverExternalPackages: ["glpk.js"],
};

export default nextConfig;
