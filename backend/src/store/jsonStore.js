import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_COLLECTIONS } from './defaultCollections.js';

export class JsonStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.mutationQueue = Promise.resolve();
  }

  async ensureCollection(name) {
    await mkdir(this.dataDir, { recursive: true });
    const filePath = this.getFilePath(name);
    try {
      await readFile(filePath, 'utf8');
    } catch {
      const fallback = DEFAULT_COLLECTIONS[name] ?? [];
      await writeFile(filePath, JSON.stringify(fallback, null, 2));
    }
  }

  getFilePath(name) {
    return join(this.dataDir, `${name}.json`);
  }

  async read(name) {
    await this.ensureCollection(name);
    const raw = await readFile(this.getFilePath(name), 'utf8');
    return JSON.parse(raw);
  }

  async write(name, data) {
    await this.ensureCollection(name);
    await writeFile(this.getFilePath(name), JSON.stringify(data, null, 2));
    return data;
  }

  async mutate(name, updater) {
    const operation = this.mutationQueue.then(async () => {
      const current = await this.read(name);
      const next = await updater(structuredClone(current));
      await this.write(name, next);
      return next;
    });

    this.mutationQueue = operation.catch(() => undefined);
    return operation;
  }

  async close() {}
}
