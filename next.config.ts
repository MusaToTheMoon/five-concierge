import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without it, Turbopack infers the
  // root from the nearest lockfile and picks up a stray package-lock.json in
  // the home directory, which triggers the multiple-lockfiles warning.
  turbopack: {
    root: __dirname,
  },
  // The embedding store is read from disk at runtime; make sure it is traced
  // into the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/api/chat": ["./data/embeddings.json"],
    "/api/itinerary": ["./data/embeddings.json"],
  },
};

export default nextConfig;
