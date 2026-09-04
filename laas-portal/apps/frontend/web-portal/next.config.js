//@ts-check
import { composePlugins, withNx } from '@nx/next';

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  nx: {},
  reactStrictMode: false,
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
];

const config = composePlugins(...plugins)(nextConfig);

// Set serverActions AFTER compose so withNx cannot override it.
// Nginx passes X-Forwarded-Host without port ($host); browser Origin includes port.
// Proper fix is nginx: proxy_set_header X-Forwarded-Host $http_host;
// This allowedOrigins is a fallback while nginx config propagates.
const allowedOrigins = (
  process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? '221.132.18.35:7300,221.132.18.35'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// @ts-ignore
config.serverActions = { allowedOrigins };

export default config;
