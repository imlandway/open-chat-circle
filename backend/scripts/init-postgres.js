import { config } from '../src/config.js';
import { createStore } from '../src/store/createStore.js';

if (config.storeDriver !== 'postgres') {
  console.error('Set STORE_DRIVER=postgres before running db:init');
  process.exit(1);
}

const store = await createStore();
await store.close();
console.log('PostgreSQL storage initialized.');
