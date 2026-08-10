/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework on an internal tool holding PII.
  poweredByHeader: false,
};

export default nextConfig;
