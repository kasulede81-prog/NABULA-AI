import type { NextConfig } from "next";

// Vercel cannot proxy to Railway *private* hostnames (*.railway.internal).
// For split deploy (web on Vercel, API on Railway) set API_PUBLIC_URL to the
// Railway-generated public URL, e.g. https://your-service.up.railway.app/v1
const apiInternal =
  process.env.API_PUBLIC_URL ??
  process.env.API_INTERNAL_URL ??
  "http://127.0.0.1:3001/v1";

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
