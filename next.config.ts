import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      // Photos uploaded while running `npm run dev:emu` (Storage emulator). Dev only.
      ...(process.env.NODE_ENV === "production"
        ? []
        : [{ protocol: "http" as const, hostname: "127.0.0.1", port: "9199" }]),
    ],
  },
  // Testing on a phone through a VS Code / Microsoft Dev Tunnel
  // (<id>-3000.<region>.devtunnels.ms): the tunnel's Origin doesn't match the
  // forwarded host, so Next rejects Server Actions ("Invalid Server Actions
  // request") and blocks dev assets unless the tunnel domain is allowed.
  allowedDevOrigins: ["*.devtunnels.ms", "**.devtunnels.ms"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.devtunnels.ms", "**.devtunnels.ms"],
    },
  },
};

export default nextConfig;
