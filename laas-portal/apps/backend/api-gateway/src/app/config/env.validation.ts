import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),

  AUTH_SERVICE_URL: Joi.string().uri().required(),
  USER_SERVICE_URL: Joi.string().uri().required(),
  LAB_SERVICE_URL: Joi.string().uri().required(),
  ORCHESTRATION_SERVICE_URL: Joi.string().uri().required(),

  JWT_SECRET: Joi.string().required(),

  GATEWAY_SHARED_SECRET: Joi.string().required(),
  ENFORCE_GATEWAY_SECRET: Joi.boolean().default(false),

  UPSTREAM_TIMEOUT_MS: Joi.number().default(300000),
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),
});
