import { NextConfig } from 'next';

const nextConfig: NextConfig = {
  eslint: {
    // allow production builds even if there are lint errors
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      // Default is 1mb; match the 10MB client-side limit in PDFUpload.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
