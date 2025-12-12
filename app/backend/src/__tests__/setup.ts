import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use in-memory database for tests
export const testDbPath = ':memory:';

// Global test database instance
export let testDb: Database.Database;

beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0'; // Use random available port
  process.env.JWT_SECRET = 'test-secret-key-for-testing';
});

afterAll(async () => {
  // Cleanup
  if (testDb) {
    testDb.close();
  }
});
