import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray pnpm-lock.yaml in the home
  // dir otherwise makes Next infer the wrong root for file tracing).
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Transformers.js loads a native ONNX runtime — keep it out of the bundle so
  // the server resolves it via native require (the local embedding provider).
  serverExternalPackages: ["@huggingface/transformers"],
};

export default nextConfig;
