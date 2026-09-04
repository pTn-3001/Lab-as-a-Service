/**
 * Requests to these path prefixes skip JWT verification entirely.
 * All other /api/* requests require a valid Bearer token.
 */
export const PUBLIC_PATHS = [
  // Auth service — unauthenticated flows
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/refresh',
  '/api/auth/logout',
  // OAuth initiation (browser redirect, no token yet)
  '/api/auth/google',
  '/api/auth/facebook',
  // Auth service root info endpoint (GET /api/auth)
  '/api/auth\x00', // sentinel — prevent prefix-matching /api/auth/me etc.

  // Flavors & public templates
  '/api/flavors',

  // Gateway health
  '/health',
  '/health/ready',
];

/** Returns true when the request path matches a public route. */
export function isPublicPath(reqPath: string): boolean {
  return PUBLIC_PATHS.some((p) => {
    // Exact match sentinel (ends with \x00)
    if (p.endsWith('\x00')) return reqPath === p.slice(0, -1);
    return reqPath.startsWith(p);
  });
}
