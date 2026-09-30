import type { NextConfig } from "next";

// `npm run build:ios` builds the static bundle that ships inside the iOS app.
// A static export can't contain the API route, so only .tsx files count as
// routes there, which leaves route.ts out.
const native = process.env.NEXT_PUBLIC_NATIVE === "1";

const nextConfig: NextConfig = native ? { output: "export", pageExtensions: ["tsx"] } : {};

export default nextConfig;
