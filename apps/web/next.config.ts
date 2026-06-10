import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nebula/shared"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
