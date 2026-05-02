/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === 'production';
const repoBasePath = '/WaterTests';

const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  basePath: isProduction ? repoBasePath : undefined,
  assetPrefix: isProduction ? `${repoBasePath}/` : undefined,
};

export default nextConfig;
