import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing. Copy .env.example to .env and add your Neon connection string.');
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
    this.pool.on('error', () => console.error('An idle database connection failed.'));
  }
  async onModuleDestroy() { await this.pool.end(); }
}
