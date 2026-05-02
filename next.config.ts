import type { NextConfig } from "next";

const repo = "WaterTests";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath: `/${repo}`,
  assetPrefix: `/${repo}/`,
};

export default nextConfig;
