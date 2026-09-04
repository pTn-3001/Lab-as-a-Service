import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../../generated/prisma-client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // Support dedicated orchestration DB URL, then generic DATABASE_URL, then local fallback.
    const connectionString =
      process.env.ORCHESTRATION_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/laas_orchestration?schema=public';

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    super({ adapter });
  }

  // Ensure DB connection is alive before serving requests.
  async onModuleInit() {
    await this.$connect();
  }
}
