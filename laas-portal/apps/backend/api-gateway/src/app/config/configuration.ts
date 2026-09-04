export default () => ({
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: parseInt(process.env['PORT'] ?? '3000', 10),

  authServiceUrl: process.env['AUTH_SERVICE_URL'],
  userServiceUrl: process.env['USER_SERVICE_URL'],
  labServiceUrl: process.env['LAB_SERVICE_URL'],
  orchestrationServiceUrl: process.env['ORCHESTRATION_SERVICE_URL'],

  jwtSecret: process.env['JWT_SECRET'],

  gatewaySharedSecret: process.env['GATEWAY_SHARED_SECRET'],
  enforceGatewaySecret: process.env['ENFORCE_GATEWAY_SECRET'] === 'true',

  upstreamTimeoutMs: parseInt(process.env['UPSTREAM_TIMEOUT_MS'] ?? '15000', 10),
  corsOrigin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3000',
});
