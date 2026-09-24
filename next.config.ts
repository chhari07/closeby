import type { NextConfig } from "next";
import path from "node:path";

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
  allowedDevOrigins: ["*.devtunnels.ms", "**.devtunnels.ms"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.devtunnels.ms", "**.devtunnels.ms"],
    },
  },
};

export default nextConfig;
