import type { NextConfig } from "next";
import path from "node:path";

// Dev tunnels are for testing on a phone locally — never trusted in production.
const isDev = process.env.NODE_ENV === "development";
const devTunnels = isDev ? ["*.devtunnels.ms", "**.devtunnels.ms"] : [];

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      // Product photos in Supabase Storage (public bucket "product-images").
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  // Testing on a phone through a VS Code / Microsoft Dev Tunnel
  // (<id>-3000.<region>.devtunnels.ms): the tunnel's Origin doesn't match the
  // forwarded host, so Next rejects Server Actions ("Invalid Server Actions
  // request") and blocks dev assets unless the tunnel domain is allowed.
  allowedDevOrigins: devTunnels,
  experimental: {
    serverActions: {
      allowedOrigins: isDev ? ["localhost:3000", ...devTunnels] : [],
    },
  },
};

export default nextConfig;
