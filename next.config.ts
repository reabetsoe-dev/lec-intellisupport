import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.11.3.144", "*.trycloudflare.com"],
  turbopack: {
    root: configDir,
  },
};

export default nextConfig;
