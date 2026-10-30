import type { NextConfig } from "next";

const config: NextConfig = {
  output: process.env.NODE_ENV === "development" ? undefined : "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  agentRules: false,
};

if (process.env.NODE_ENV === "development") {
  config.rewrites = async () => {
    const backend = process.env.EA_BACKEND_URL || "http://127.0.0.1:8766";
    const url = new URL(backend);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      url.origin !== backend
    )
      throw new Error("EA_BACKEND_URL must be a loopback HTTP origin");
    return [
      "/api/:path*",
      "/files/:path*",
      "/history/files/:path*",
      "/exports/:path*",
    ].map((source) => ({ source, destination: `${backend}${source}` }));
  };
}

export default config;
