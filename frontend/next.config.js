/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpila el paquete compartido del monorepo (TS sin pre-compilar).
  transpilePackages: ['@gen-task/shared'],
};

module.exports = nextConfig;
