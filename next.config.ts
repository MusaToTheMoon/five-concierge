import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The embedding store is read from disk at runtime; make sure it is traced
  // into the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/api/chat": ["./data/embeddings.json"],
    "/api/itinerary": ["./data/embeddings.json"],
  },
};

export default nextConfig;
