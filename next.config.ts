import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow the dev server to be accessed from the local network (e.g. iPhone testing).
  // Dev-only setting; has no effect on production builds.
  allowedDevOrigins: ['192.168.10.81'],
};

export default nextConfig;
