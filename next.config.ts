import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));
const backendUrl = (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://lec-intellisupport-backend.onrender.com"
).replace(/\/+$/g, "");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.11.3.144", "*.trycloudflare.com"],
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/whatsapp/:path*",
          destination: `${backendUrl}/api/whatsapp/:path*`,
        },
      ],
    }
  },
  turbopack: {
    root: configDir,
  },
};

export default nextConfig;
