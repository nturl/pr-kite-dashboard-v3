

const nextConfig = {
  // Allow Leaflet to work in SSR context
  webpack: (config) => {
    config.resolve.fallback = { fs: false };
    return config;
  },
};

export default nextConfig;
