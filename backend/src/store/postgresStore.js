import { Pool } from 'pg';
import { DEFAULT_COLLECTIONS } from './defaultCollections.js';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app_collections (
    name TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

export class PostgresStore {
  constructor(databaseUrl) {
    this.pool = new Pool({
      connectionString: databaseUrl,
    });
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }
    await this.pool.query(CREATE_TABLE_SQL);
    for (const [name, fallback] of Object.entries(DEFAULT_COLLECTIONS)) {
      await this.pool.query(
        `
          INSERT INTO app_collections (name, data)
          VALUES ($1, $2::jsonb)
          ON CONFLICT (name) DO NOTHING
        `,
        [name, JSON.stringify(fallback)],
      );
    }
    this.initialized = true;
  }

  async read(name) {
    await this.initialize();
    const result = await this.pool.query(
      'SELECT data FROM app_collections WHERE name = $1',
      [name],
    );
    if (result.rowCount === 0) {
      const fallback = DEFAULT_COLLECTIONS[name] ?? [];
      await this.write(name, fallback);
      return fallback;
    }
    return result.rows[0].data;
  }

  async write(name, data) {
    await this.initialize();
    await this.pool.query(
      `
        INSERT INTO app_collections (name, data, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (name)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `,
      [name, JSON.stringify(data)],
    );
    return data;
  }

  async mutate(name, updater) {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT data FROM app_collections WHERE name = $1 FOR UPDATE',
        [name],
      );
      const current = existing.rowCount === 0
        ? structuredClone(DEFAULT_COLLECTIONS[name] ?? [])
        : existing.rows[0].data;
      const next = await updater(structuredClone(current));
      await client.query(
        `
          INSERT INTO app_collections (name, data, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (name)
          DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        `,
        [name, JSON.stringify(next)],
      );
      await client.query('COMMIT');
      return next;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}
