import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["opencc-js"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/unlock",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/go/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
