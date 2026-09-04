/// <reference types="node" />
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url:
      process.env['AUTH_DATABASE_URL'] ||
      'postgresql://postgres:30012004@localhost:5432/laas_auth?schema=public',
  },
});
