import { config } from '../config.js';
import { JsonStore } from './jsonStore.js';
import { PostgresStore } from './postgresStore.js';

export async function createStore() {
  if (config.storeDriver === 'postgres') {
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL is required when STORE_DRIVER=postgres.');
    }
    const store = new PostgresStore(config.databaseUrl);
    await store.initialize();
    return store;
  }

  return new JsonStore(config.dataDir);
}
