import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native code, loaded from node_modules at run time rather than bundled
  // (the car photo model, src/lib/car-photo.ts).
  serverExternalPackages: ["onnxruntime-node"],
  experimental: {
    // Room for a brand logo and a car photo (up to 8MB each) in one form.
    serverActions: { bodySizeLimit: "20mb" },
    // Requests pass through src/proxy.ts; this also has to fit a backup file
    // being restored (every photo and logo, base64 in gzipped JSON).
    proxyClientMaxBodySize: "200mb",
  },
};

export default nextConfig;
