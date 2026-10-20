import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Cross-origin isolation lets the in-browser OCR (onnxruntime-web) use several CPU threads.
  // The site loads no third-party resources, so these headers break nothing.
  async headers() {
    const isolation = [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
    ];
    // vinext's "/:path*" does not match the root page, so "/" is listed separately.
    return [{ source: "/", headers: isolation }, { source: "/:path*", headers: isolation }];
  },
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
