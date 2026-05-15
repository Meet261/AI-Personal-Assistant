import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply CORS headers to all /api/research/* routes
        source: '/api/research/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'http://localhost:5173' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ];
  },
};

export default nextConfig;
