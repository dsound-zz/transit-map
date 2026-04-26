import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // data/*.json files are generated at build time by the prebuild script and
  // loaded at runtime via readFileSync. Vercel's file tracer can't detect
  // dynamic paths, so we explicitly include them in the API route bundles.
  outputFileTracingIncludes: {
    '/api/*': ['./data/**/*'],
  },
};

export default nextConfig;
