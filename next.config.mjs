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
  // Necessário para o IfcAssetViewer resolver a URL do WASM em GH Pages.
  env: {
    NEXT_PUBLIC_BASE_PATH: isProduction ? repoBasePath : '',
  },
};

export default nextConfig;
