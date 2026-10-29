import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["glpk.js"],
  async redirects() {
    return [
      { source: "/week/:n/:page(dfs|optimize|players)/fd/:rest*", destination: "/week/:n/:page/dk/:rest*", permanent: false },
    ];
  },
  turbopack: {},
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};

export default nextConfig;
