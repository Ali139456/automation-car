import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Ensure Turbopack treats THIS directory as the app root (avoids picking a parent `package-lock.json`
// in `D:\\Work\\Automation` and breaking module resolution in dev).
const appDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: appDir,
  },
  // Native/heavy deps: keep external so the runtime loads real node_modules (avoids
  // Turbopack hashed externals like `node-cron-*` that break instrumentation).
  serverExternalPackages: ["playwright", "node-cron"],
};

export default nextConfig;
