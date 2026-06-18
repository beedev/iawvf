/**
 * Single source of truth for the dedicated TEST database connection.
 *
 * Every Jest suite — unit specs that `new PrismaService()` directly and e2e
 * specs that boot the Nest app — must read DATABASE_URL from process.env. By
 * pointing that variable at `iawnode_test` BEFORE any Prisma client or
 * @nestjs/config instance is constructed, the entire suite is isolated from the
 * live development database (`iawnode`). Tests truncate freely; dev data is safe.
 *
 * Override semantics: @nestjs/config delegates to dotenv, which never overwrites
 * a variable already present in process.env. Setting it here (in globalSetup and
 * again in setupFiles) therefore wins over any value loaded from `.env`.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://iaw:iaw@localhost:5433/iawnode_test?schema=public';

/**
 * Force the running process to use the test database. Idempotent and safe to
 * call multiple times (globalSetup once, then once per Jest worker).
 */
export function useTestDatabase(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}
