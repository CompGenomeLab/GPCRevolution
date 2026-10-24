import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the taxonomic-distribution page was called phyletic-distribution; keep old links working
  async redirects() {
    return [
      { source: "/phyletic-distribution", destination: "/taxonomic-distribution", permanent: true },
    ];
  },
};

export default nextConfig;
