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
  // Playwright is a large native dependency; keep it external to the Next bundle.
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
