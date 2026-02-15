import { ensureTestDatabase } from './ensureTestDatabase.js';

/**
 * Global setup for Vitest - runs once before all tests
 * This ensures the test database is bootstrapped only once, avoiding race conditions
 */
export async function setup() {
  console.log('\n🔧 Bootstrapping test database...\n');
  await ensureTestDatabase();
  console.log('\n✓ Test database ready\n');
}

export async function teardown() {
  // Cleanup can go here if needed
}
