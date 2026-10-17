import type { NextConfig } from "next";
// turbopackFileSystemCacheForBuild off: on October 8, 2026 a restored Turbopack build cache shipped the previous CSS.
const config: NextConfig = { experimental: { inlineCss: true, cpus: 2, turbopackFileSystemCacheForBuild: false }, poweredByHeader: false };
export default config;
