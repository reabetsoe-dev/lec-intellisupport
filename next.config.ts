import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.11.3.144", "*.trycloudflare.com"],
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/whatsapp/:path*",
          destination: "http://127.0.0.1:8000/api/whatsapp/:path*",
        },
      ],
    }
  },
  turbopack: {
    root: configDir,
  },
};

export default nextConfig;
