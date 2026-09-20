import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @sibyl/ui ships TypeScript source (main: ./src/index.ts), so Next must compile it.
  transpilePackages: ["@sibyl/ui"],
};

export default nextConfig;
