import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // vinext checks every multipart POST (including /api/applications uploads) against this
      // limit before routing; the default 1 MB rejected any application with a real document.
      // Keep in sync with MAX_REQUEST_BYTES in app/api/applications/route.ts and Nginx client_max_body_size.
      bodySizeLimit: "85mb",
    },
  },
};

export default nextConfig;
