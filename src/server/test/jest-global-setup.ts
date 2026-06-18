import { execFileSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './test-database';

/**
 * Jest globalSetup — runs ONCE in the parent process before any test worker or
 * test module is loaded.
 *
 * Responsibilities:
 *  1. Pin DATABASE_URL to the dedicated test database so nothing ever touches
 *     the live development database (`iawnode`).
 *  2. Apply the Prisma schema to the test database via `migrate deploy`
 *     (idempotent — re-applying committed migrations is a no-op once current).
 *
 * Note: globalSetup runs in its own module scope; it cannot mutate the env of
 * the worker processes directly, so each worker re-pins DATABASE_URL via the
 * setupFiles guard (jest-setup-env.ts). Migration, however, only needs to happen
 * once, which is exactly what this hook guarantees.
 */
export default function globalSetup(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL;

  // eslint-disable-next-line no-console
  console.log(`\n[jest] Using test database: ${TEST_DATABASE_URL}`);

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
