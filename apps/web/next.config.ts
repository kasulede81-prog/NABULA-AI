import type { NextConfig } from "next";

const apiInternal =
  process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001/v1";

const nextConfig: NextConfig = {
  transpilePackages: ["@nebula/shared"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiInternal}/:path*` }];
  },
};

export default nextConfig;
