import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  async redirects() {
    return [
      {
        source: "/:path*",
        destination: "https://maiq.enscribe.dev/:path*",
        permanent: true,
      },
    ];
  },
};
export default nextConfig;
