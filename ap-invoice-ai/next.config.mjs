/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Server actions handle uploads; raise the body limit for invoice files (<=25MB per §2.6).
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
