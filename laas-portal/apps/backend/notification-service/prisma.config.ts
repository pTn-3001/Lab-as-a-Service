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
      process.env['NOTIFICATION_DATABASE_URL'] ||
      'postgresql://postgres:postgres@localhost:5432/laas_notifications?schema=public',
  },
});
